import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, TaskStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { paginationFrom, type PaginatedResult } from '../../common/dto/pagination.dto';
import {
  canManageTask,
  canReviewTask,
  taskScopeWhere,
} from '../../common/utils/scope';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { CommentTaskDto } from './dto/comment-task.dto';
import type { CreateTaskDto } from './dto/create-task.dto';
import type { ListTasksDto } from './dto/list-tasks.dto';
import type { ReviewTaskDto } from './dto/review-task.dto';
import type { UpdateTaskDto } from './dto/update-task.dto';

const TASK_LIST_SELECT = {
  id: true,
  title: true,
  description: true,
  assignee_id: true,
  project_id: true,
  lead_id: true,
  created_by: true,
  priority: true,
  status: true,
  progress_pct: true,
  block_reason: true,
  due_date: true,
  completed_at: true,
  created_at: true,
  updated_at: true,
  assignee: { select: { id: true, full_name: true } },
  creator: { select: { id: true, full_name: true } },
  project: { select: { id: true, name: true, team_id: true } },
  lead: { select: { id: true, name: true } },
} satisfies Prisma.TaskSelect;

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(actor: AuthenticatedUser, query: ListTasksDto): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip } = paginationFrom(query);
    const where: Prisma.TaskWhereInput = {
      AND: [
        taskScopeWhere(actor),
        query.status ? { status: query.status } : {},
        query.priority ? { priority: query.priority } : {},
        query.assignee_id ? { assignee_id: query.assignee_id } : {},
        query.project_id ? { project_id: query.project_id } : {},
        query.team_id
          ? {
              OR: [
                { project: { team_id: query.team_id } },
                { lead: { team_id: query.team_id } },
              ],
            }
          : {},
        query.overdue
          ? {
              due_date: { lt: new Date() },
              status: { notIn: ['completed'] },
            }
          : {},
        query.q
          ? {
              OR: [
                { title: { contains: query.q, mode: 'insensitive' } },
                { description: { contains: query.q, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        select: TASK_LIST_SELECT,
        orderBy: [
          { status: 'asc' },
          { priority: 'desc' },
          { due_date: { sort: 'asc', nulls: 'last' } },
          { created_at: 'desc' },
        ],
        take: limit,
        skip,
      }),
      this.prisma.task.count({ where }),
    ]);

    return {
      data: rows.map(decorateOverdue),
      meta: { page, limit, total },
    };
  }

  async board(actor: AuthenticatedUser, query: { project_id?: string; team_id?: string }) {
    const where: Prisma.TaskWhereInput = {
      AND: [
        taskScopeWhere(actor),
        query.project_id ? { project_id: query.project_id } : {},
        query.team_id
          ? {
              OR: [
                { project: { team_id: query.team_id } },
                { lead: { team_id: query.team_id } },
              ],
            }
          : {},
      ],
    };
    const rows = await this.prisma.task.findMany({
      where,
      select: TASK_LIST_SELECT,
      orderBy: [
        { priority: 'desc' },
        { due_date: { sort: 'asc', nulls: 'last' } },
        { created_at: 'desc' },
      ],
      take: 500,
    });
    const grouped: Record<TaskStatus, ReturnType<typeof decorateOverdue>[]> = {
      todo: [],
      in_progress: [],
      in_review: [],
      completed: [],
      blocked: [],
    };
    for (const row of rows) grouped[row.status].push(decorateOverdue(row));
    return grouped;
  }

  async mine(actor: AuthenticatedUser) {
    const rows = await this.prisma.task.findMany({
      where: {
        assignee_id: actor.id,
        status: { notIn: ['completed'] },
      },
      select: TASK_LIST_SELECT,
      orderBy: [
        { status: 'asc' },
        { priority: 'desc' },
        { due_date: { sort: 'asc', nulls: 'last' } },
      ],
      take: 100,
    });
    return rows.map(decorateOverdue);
  }

  async getOne(actor: AuthenticatedUser, id: string) {
    const task = await this.prisma.task.findFirst({
      where: { AND: [{ id }, taskScopeWhere(actor)] },
      select: {
        ...TASK_LIST_SELECT,
        activities: {
          orderBy: { created_at: 'desc' },
          take: 200,
          select: {
            id: true,
            task_id: true,
            actor_id: true,
            action: true,
            note: true,
            created_at: true,
          },
        },
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    return { ...decorateOverdue(task), activities: task.activities };
  }

  async create(actor: AuthenticatedUser, dto: CreateTaskDto) {
    if (actor.role === Role.intern) {
      throw new ForbiddenException('Only admins or team leaders can create tasks');
    }
    if (!dto.project_id && !dto.lead_id && !dto.assignee_id) {
      // Allow free-standing tasks but require *something* to pin scope to.
      throw new BadRequestException(
        'Task must have at least one of assignee_id, project_id, or lead_id',
      );
    }
    await this.validateRefs(actor, dto.assignee_id, dto.project_id, dto.lead_id);

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          title: dto.title,
          description: dto.description ?? null,
          assignee_id: dto.assignee_id ?? null,
          project_id: dto.project_id ?? null,
          lead_id: dto.lead_id ?? null,
          created_by: actor.id,
          priority: dto.priority ?? 'medium',
          due_date: dto.due_date ? new Date(dto.due_date) : null,
        },
        select: TASK_LIST_SELECT,
      });
      await tx.taskActivity.create({
        data: {
          task_id: task.id,
          actor_id: actor.id,
          action: 'created',
          note: dto.assignee_id ? `Assigned on creation` : null,
        },
      });
      const result = decorateOverdue(task);
      if (dto.assignee_id) {
        // Fire-and-forget; runs outside the txn so the response isn't gated on it.
        void this.notifications.notifyTaskAssigned(task.id, dto.assignee_id, actor.id);
      }
      return result;
    });
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateTaskDto) {
    const existing = await this.requireManageable(actor, id);

    if (dto.status && dto.status === 'completed' && actor.id === existing.assignee_id) {
      // Assignees can transition to `in_review`, not directly to `completed`.
      throw new BadRequestException(
        'Submit your work as in_review; a leader will mark it completed via the review endpoint',
      );
    }
    if (dto.status === 'blocked' && !dto.block_reason && !existing.block_reason) {
      throw new BadRequestException('block_reason is required when marking a task as blocked');
    }

    await this.validateRefs(actor, dto.assignee_id, dto.project_id, dto.lead_id);

    const becameCompleted = dto.status === 'completed' && existing.status !== 'completed';
    const leftCompleted = existing.status === 'completed' && dto.status && dto.status !== 'completed';

    // Block reason: set when entering blocked, clear when leaving blocked,
    // leave untouched when status isn't changing.
    const blockReasonUpdate: string | null | undefined = (() => {
      if (dto.status === 'blocked') return dto.block_reason ?? undefined;
      if (dto.status) return null; // status is set to something other than 'blocked'
      return undefined;
    })();

    const data: Prisma.TaskUpdateInput = {
      title: dto.title ?? undefined,
      description: dto.description ?? undefined,
      priority: dto.priority ?? undefined,
      status: dto.status ?? undefined,
      progress_pct: dto.progress_pct ?? undefined,
      block_reason: blockReasonUpdate,
      due_date: dto.due_date ? new Date(dto.due_date) : undefined,
      completed_at: becameCompleted ? new Date() : leftCompleted ? null : undefined,
      assignee: dto.assignee_id ? { connect: { id: dto.assignee_id } } : undefined,
      project: dto.project_id ? { connect: { id: dto.project_id } } : undefined,
      lead: dto.lead_id ? { connect: { id: dto.lead_id } } : undefined,
    };

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.update({
        where: { id: existing.id },
        data,
        select: TASK_LIST_SELECT,
      });

      const actions: { action: string; note: string | null }[] = [];
      if (dto.status && dto.status !== existing.status) {
        actions.push({
          action: 'status_changed',
          note: `${existing.status} → ${dto.status}${
            dto.status === 'blocked' && dto.block_reason ? `: ${dto.block_reason}` : ''
          }`,
        });
      }
      if (dto.assignee_id && dto.assignee_id !== existing.assignee_id) {
        actions.push({ action: 'assigned', note: `Assigned to ${dto.assignee_id}` });
      }
      if (dto.progress_pct !== undefined && dto.progress_pct !== existing.progress_pct) {
        actions.push({ action: 'progress', note: `Progress: ${dto.progress_pct}%` });
      }
      if (actions.length === 0) {
        actions.push({ action: 'edited', note: null });
      }

      await tx.taskActivity.createMany({
        data: actions.map((a) => ({
          task_id: existing.id,
          actor_id: actor.id,
          action: a.action,
          note: a.note,
        })),
      });

      if (dto.assignee_id && dto.assignee_id !== existing.assignee_id) {
        void this.notifications.notifyTaskAssigned(task.id, dto.assignee_id, actor.id);
      }

      return decorateOverdue(task);
    });
  }

  async review(actor: AuthenticatedUser, id: string, dto: ReviewTaskDto) {
    const existing = await this.requireReviewable(actor, id);
    if (existing.status !== 'in_review') {
      throw new BadRequestException(
        `Cannot review a task in status ${existing.status}; it must be in_review`,
      );
    }

    const targetStatus: TaskStatus = dto.decision === 'approve' ? 'completed' : 'in_progress';

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.update({
        where: { id: existing.id },
        data: {
          status: targetStatus,
          progress_pct: dto.decision === 'approve' ? 100 : existing.progress_pct,
          completed_at: dto.decision === 'approve' ? new Date() : null,
        },
        select: TASK_LIST_SELECT,
      });
      await tx.taskActivity.create({
        data: {
          task_id: existing.id,
          actor_id: actor.id,
          action: dto.decision === 'approve' ? 'approved' : 'reopened',
          note: dto.feedback ?? null,
        },
      });
      if (existing.assignee_id) {
        void this.notifications.notifyTaskReviewed(
          existing.id,
          existing.assignee_id,
          dto.decision,
          actor.id,
        );
      }
      return decorateOverdue(task);
    });
  }

  async comment(actor: AuthenticatedUser, id: string, dto: CommentTaskDto) {
    await this.requireManageable(actor, id);
    return this.prisma.taskActivity.create({
      data: {
        task_id: id,
        actor_id: actor.id,
        action: 'commented',
        note: dto.note,
      },
    });
  }

  async getActivities(actor: AuthenticatedUser, id: string) {
    await this.ensureVisible(actor, id);
    return this.prisma.taskActivity.findMany({
      where: { task_id: id },
      orderBy: { created_at: 'desc' },
      take: 200,
    });
  }

  private async ensureVisible(actor: AuthenticatedUser, id: string) {
    const task = await this.prisma.task.findFirst({
      where: { AND: [{ id }, taskScopeWhere(actor)] },
      select: { id: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  private async requireManageable(actor: AuthenticatedUser, id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      select: {
        id: true,
        assignee_id: true,
        created_by: true,
        status: true,
        progress_pct: true,
        block_reason: true,
        project: { select: { team_id: true } },
        lead: { select: { team_id: true } },
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    if (!canManageTask(actor, task)) throw new ForbiddenException('Cannot modify this task');
    return task;
  }

  private async requireReviewable(actor: AuthenticatedUser, id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      select: {
        id: true,
        assignee_id: true,
        created_by: true,
        status: true,
        progress_pct: true,
        project: { select: { team_id: true } },
        lead: { select: { team_id: true } },
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    if (!canReviewTask(actor, task)) {
      throw new ForbiddenException('Cannot review this task');
    }
    return task;
  }

  private async validateRefs(
    actor: AuthenticatedUser,
    assigneeId?: string,
    projectId?: string,
    leadId?: string,
  ) {
    if (assigneeId) {
      const u = await this.prisma.user.findUnique({
        where: { id: assigneeId },
        select: { id: true, status: true },
      });
      if (!u) throw new BadRequestException('assignee_id does not exist');
      if (u.status !== 'active') throw new BadRequestException('assignee is not active');
    }
    if (projectId) {
      const p = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, team_id: true },
      });
      if (!p) throw new BadRequestException('project_id does not exist');
      if (actor.role === Role.team_leader && !actor.led_team_ids.includes(p.team_id)) {
        throw new ForbiddenException('Cannot attach to a project outside your teams');
      }
    }
    if (leadId) {
      const l = await this.prisma.lead.findUnique({
        where: { id: leadId },
        select: { id: true, team_id: true },
      });
      if (!l) throw new BadRequestException('lead_id does not exist');
      if (
        actor.role === Role.team_leader &&
        l.team_id !== null &&
        !actor.led_team_ids.includes(l.team_id)
      ) {
        throw new ForbiddenException('Cannot attach to a lead outside your teams');
      }
    }
  }
}

function decorateOverdue<T extends { due_date: Date | null; status: TaskStatus }>(
  row: T,
): T & { is_overdue: boolean } {
  const isOverdue =
    row.due_date !== null && row.status !== 'completed' && row.due_date.getTime() < Date.now();
  return { ...row, is_overdue: isOverdue };
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, ProjectStatus, Role } from '@prisma/client';
import { SYSTEM_ACTOR } from '../../common/constants/system-actor';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { paginationFrom, type PaginatedResult } from '../../common/dto/pagination.dto';
import { canManageProject, projectScopeWhere } from '../../common/utils/scope';
import { AnthropicService } from '../ai/anthropic.service';
import {
  ProjectRiskService,
  type ProjectToAssess,
} from '../ai/project-risk.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PROJECT_RISK_BATCH_LIMIT,
  AssessProjectRisksDto,
} from './dto/assess-risk.dto';
import type {
  CreateDeliverableDto,
  UpdateDeliverableDto,
} from './dto/deliverable.dto';
import type { CreateProjectDto } from './dto/create-project.dto';
import type { ListProjectsDto } from './dto/list-projects.dto';
import type { UpdateProjectDto } from './dto/update-project.dto';

const PROJECT_BASE_SELECT = {
  id: true,
  name: true,
  description: true,
  client_name: true,
  category: true,
  team_id: true,
  status: true,
  progress_pct: true,
  start_date: true,
  deadline: true,
  ai_risk_score: true,
  ai_risk_band: true,
  ai_risk_concern: true,
  ai_risk_actions: true,
  ai_risk_model: true,
  ai_risk_at: true,
  created_at: true,
  updated_at: true,
  team: { select: { id: true, name: true } },
} satisfies Prisma.ProjectSelect;

const PROJECT_LIST_SELECT = {
  ...PROJECT_BASE_SELECT,
  deliverables: { select: { is_done: true } },
  tasks: { select: { status: true } },
} satisfies Prisma.ProjectSelect;

type ProjectListRow = Prisma.ProjectGetPayload<{ select: typeof PROJECT_LIST_SELECT }>;

/** Wider select used to build per-project risk signal for the AI assessor. */
const PROJECT_RISK_INPUT_SELECT = {
  id: true,
  name: true,
  status: true,
  client_name: true,
  progress_pct: true,
  start_date: true,
  deadline: true,
  team: { select: { name: true } },
  deliverables: { select: { is_done: true } },
  tasks: {
    select: {
      id: true,
      title: true,
      status: true,
      block_reason: true,
      updated_at: true,
      assignee: { select: { full_name: true } },
    },
  },
} satisfies Prisma.ProjectSelect;

const APPROACHING_DAYS = 7;
const TERMINAL_STATUSES: ProjectStatus[] = ['completed', 'cancelled'];

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly riskService: ProjectRiskService,
    private readonly anthropic: AnthropicService,
  ) {}

  /**
   * Nightly AI risk reassessment of the top in-scope active projects. Auto-pick
   * already filters to non-terminal and caps the batch at 20. Skips when
   * Anthropic isn't configured.
   */
  @Cron('30 3 * * *', { name: 'projects-ai-risk-nightly' })
  async cronAssessRisks() {
    if (!this.anthropic.isAvailable()) return;
    try {
      const result = await this.assessRisks(SYSTEM_ACTOR, {});
      this.logger.log(
        `Project risk cron: ${result.assessed.length} projects assessed (model: ${result.model})`,
      );
    } catch (err) {
      this.logger.error(`Project risk cron failed: ${(err as Error).message}`);
    }
  }

  async list(actor: AuthenticatedUser, query: ListProjectsDto): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip } = paginationFrom(query);
    const baseWhere: Prisma.ProjectWhereInput = {
      AND: [
        projectScopeWhere(actor),
        query.status ? { status: query.status } : {},
        query.team_id ? { team_id: query.team_id } : {},
        query.q
          ? {
              OR: [
                { name: { contains: query.q, mode: 'insensitive' } },
                { client_name: { contains: query.q, mode: 'insensitive' } },
                { category: { contains: query.q, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where: baseWhere,
        select: PROJECT_LIST_SELECT,
        orderBy: [
          { status: 'asc' },
          { deadline: { sort: 'asc', nulls: 'last' } },
          { created_at: 'desc' },
        ],
        take: limit,
        skip,
      }),
      this.prisma.project.count({ where: baseWhere }),
    ]);

    let decorated = rows.map(decorate);
    if (query.at_risk) {
      decorated = decorated.filter(
        (p) => p.deadline_risk !== 'none' && !TERMINAL_STATUSES.includes(p.status),
      );
    }

    return { data: decorated, meta: { page, limit, total } };
  }

  async getOne(actor: AuthenticatedUser, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { AND: [{ id }, projectScopeWhere(actor)] },
      select: {
        ...PROJECT_LIST_SELECT,
        deliverables: {
          select: {
            id: true,
            project_id: true,
            title: true,
            is_done: true,
            created_at: true,
            updated_at: true,
          },
          orderBy: [{ is_done: 'asc' }, { created_at: 'asc' }],
        },
        tasks: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            due_date: true,
            progress_pct: true,
            assignee: { select: { id: true, full_name: true } },
          },
          orderBy: [{ status: 'asc' }, { due_date: { sort: 'asc', nulls: 'last' } }],
          take: 200,
        },
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    const decorated = decorate(project);
    return {
      ...decorated,
      deliverables: project.deliverables,
      tasks: project.tasks,
    };
  }

  async create(actor: AuthenticatedUser, dto: CreateProjectDto) {
    if (actor.role !== Role.super_admin) {
      throw new ForbiddenException('Only the Super Admin can create projects');
    }
    const team = await this.prisma.team.findUnique({
      where: { id: dto.team_id },
      select: { id: true },
    });
    if (!team) throw new BadRequestException('team_id does not exist');

    return this.prisma.project.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        client_name: dto.client_name ?? null,
        category: dto.category ?? null,
        team_id: dto.team_id,
        start_date: dto.start_date ? new Date(dto.start_date) : null,
        deadline: dto.deadline ? new Date(dto.deadline) : null,
      },
      select: PROJECT_BASE_SELECT,
    });
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateProjectDto) {
    const existing = await this.requireManageable(actor, id);

    if (dto.team_id && actor.role === Role.team_leader) {
      if (!actor.led_team_ids.includes(dto.team_id)) {
        throw new ForbiddenException('Cannot move project to a team you do not lead');
      }
    }

    const becameCompleted =
      dto.status === 'completed' && existing.status !== 'completed';

    return this.prisma.project.update({
      where: { id: existing.id },
      data: {
        name: dto.name ?? undefined,
        description: dto.description ?? undefined,
        client_name: dto.client_name ?? undefined,
        category: dto.category ?? undefined,
        team_id: dto.team_id ?? undefined,
        status: dto.status ?? undefined,
        progress_pct: dto.progress_pct ?? (becameCompleted ? 100 : undefined),
        start_date: dto.start_date ? new Date(dto.start_date) : undefined,
        deadline: dto.deadline ? new Date(dto.deadline) : undefined,
      },
      select: PROJECT_BASE_SELECT,
    });
  }

  /**
   * Copies the derived progress (from tasks + deliverables) into the stored
   * `progress_pct` column. Surfaces as the "Sync from tasks" action.
   */
  async syncProgress(actor: AuthenticatedUser, id: string) {
    const existing = await this.requireManageable(actor, id);
    const computed = await this.computeDerivedProgress(existing.id);
    return this.prisma.project.update({
      where: { id: existing.id },
      data: { progress_pct: computed },
      select: PROJECT_BASE_SELECT,
    });
  }

  async listDeliverables(actor: AuthenticatedUser, projectId: string) {
    await this.ensureVisible(actor, projectId);
    return this.prisma.projectDeliverable.findMany({
      where: { project_id: projectId },
      orderBy: [{ is_done: 'asc' }, { created_at: 'asc' }],
    });
  }

  async addDeliverable(actor: AuthenticatedUser, projectId: string, dto: CreateDeliverableDto) {
    await this.requireManageable(actor, projectId);
    return this.prisma.projectDeliverable.create({
      data: { project_id: projectId, title: dto.title },
    });
  }

  async updateDeliverable(
    actor: AuthenticatedUser,
    projectId: string,
    deliverableId: string,
    dto: UpdateDeliverableDto,
  ) {
    await this.requireManageable(actor, projectId);
    const existing = await this.prisma.projectDeliverable.findFirst({
      where: { id: deliverableId, project_id: projectId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Deliverable not found');
    return this.prisma.projectDeliverable.update({
      where: { id: existing.id },
      data: {
        title: dto.title ?? undefined,
        is_done: dto.is_done ?? undefined,
      },
    });
  }

  async removeDeliverable(actor: AuthenticatedUser, projectId: string, deliverableId: string) {
    await this.requireManageable(actor, projectId);
    const deleted = await this.prisma.projectDeliverable.deleteMany({
      where: { id: deliverableId, project_id: projectId },
    });
    if (deleted.count === 0) throw new NotFoundException('Deliverable not found');
    return { removed: deleted.count };
  }

  /**
   * AI-assesses delivery risk on a batch of projects. Persists score, band,
   * concern, and 1-3 suggested actions back to each project so the board can
   * show colored risk badges without re-calling Claude on every page load.
   */
  async assessRisks(actor: AuthenticatedUser, dto: AssessProjectRisksDto) {
    if (actor.role === Role.intern) {
      throw new ForbiddenException('Interns cannot trigger project risk assessment');
    }

    const projects = dto.project_ids?.length
      ? await this.prisma.project.findMany({
          where: {
            AND: [
              projectScopeWhere(actor),
              { id: { in: dto.project_ids } },
            ],
          },
          select: PROJECT_RISK_INPUT_SELECT,
        })
      : await this.prisma.project.findMany({
          where: {
            AND: [
              projectScopeWhere(actor),
              { status: { notIn: ['completed', 'cancelled'] } },
            ],
          },
          select: PROJECT_RISK_INPUT_SELECT,
          orderBy: [
            { deadline: { sort: 'asc', nulls: 'last' } },
            { updated_at: 'desc' },
          ],
          take: PROJECT_RISK_BATCH_LIMIT,
        });

    if (projects.length === 0) {
      return {
        assessed: [],
        model: 'n/a',
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
        generated_at: new Date().toISOString(),
      };
    }

    const now = Date.now();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const toAssess: ProjectToAssess[] = projects.map((p) => {
      // Tasks-by-status histogram
      const tasksByStatus = {
        todo: 0,
        in_progress: 0,
        in_review: 0,
        completed: 0,
        blocked: 0,
      };
      for (const t of p.tasks) tasksByStatus[t.status] += 1;

      const dTotal = p.deliverables.length;
      const dDone = p.deliverables.filter((d) => d.is_done).length;
      const tTotal = p.tasks.length;
      const tDone = tasksByStatus.completed;

      const derived =
        dTotal === 0 && tTotal === 0
          ? 0
          : dTotal === 0
            ? Math.round((tDone / tTotal) * 100)
            : tTotal === 0
              ? Math.round((dDone / dTotal) * 100)
              : Math.round(((dDone / dTotal) * 50) + ((tDone / tTotal) * 50));

      const daysSinceStart = p.start_date
        ? Math.floor((now - p.start_date.getTime()) / (1000 * 60 * 60 * 24))
        : null;
      const daysUntilDeadline = p.deadline
        ? Math.floor((p.deadline.getTime() - now) / (1000 * 60 * 60 * 24))
        : null;

      let deadlineRisk: 'none' | 'approaching' | 'overdue' = 'none';
      if (p.deadline && p.status !== 'completed' && p.status !== 'cancelled') {
        if (p.deadline.getTime() < now) deadlineRisk = 'overdue';
        else if (
          p.deadline.getTime() - now <
          APPROACHING_DAYS * 24 * 60 * 60 * 1000
        ) {
          deadlineRisk = 'approaching';
        }
      }

      // Blocked tasks with reasons + assignee for high signal
      const blockedTasks = p.tasks
        .filter((t) => t.status === 'blocked')
        .slice(0, 5)
        .map((t) => ({
          title: t.title,
          reason: t.block_reason,
          assignee_name: t.assignee?.full_name ?? null,
        }));

      // Assignee load — open tasks (not completed) grouped by assignee
      const loadMap = new Map<string, number>();
      for (const t of p.tasks) {
        if (t.status === 'completed') continue;
        const name = t.assignee?.full_name;
        if (!name) continue;
        loadMap.set(name, (loadMap.get(name) ?? 0) + 1);
      }
      const assigneeLoad = [...loadMap.entries()]
        .map(([assignee_name, open_tasks]) => ({ assignee_name, open_tasks }))
        .sort((a, b) => b.open_tasks - a.open_tasks)
        .slice(0, 6);

      // Momentum — tasks touched in the last 7 days
      const tasksTouched = p.tasks.filter(
        (t) => t.updated_at.getTime() >= sevenDaysAgo.getTime(),
      ).length;

      return {
        id: p.id,
        name: p.name,
        status: p.status,
        team_name: p.team.name,
        client_name: p.client_name,
        progress_pct: p.progress_pct,
        derived_progress_pct: derived,
        days_since_start: daysSinceStart,
        days_until_deadline: daysUntilDeadline,
        deadline_risk: deadlineRisk,
        deliverables_total: dTotal,
        deliverables_done: dDone,
        tasks_total: tTotal,
        tasks_by_status: tasksByStatus,
        blocked_tasks: blockedTasks,
        assignee_load: assigneeLoad,
        tasks_touched_last_7_days: tasksTouched,
      };
    });

    const result = await this.riskService.assess({ projects: toAssess });

    // Persist back per-project
    if (result.assessed.length > 0) {
      const stampedAt = new Date();
      await this.prisma.$transaction(
        result.assessed.map((a) =>
          this.prisma.project.update({
            where: { id: a.project_id },
            data: {
              ai_risk_score: a.score,
              ai_risk_band: a.band,
              ai_risk_concern: a.top_concern,
              ai_risk_actions: a.suggested_actions as unknown as Prisma.InputJsonValue,
              ai_risk_model: result.model,
              ai_risk_at: stampedAt,
            },
          }),
        ),
      );
    }

    return {
      assessed: result.assessed,
      model: result.model,
      usage: result.usage,
      generated_at: new Date().toISOString(),
    };
  }

  private async ensureVisible(actor: AuthenticatedUser, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { AND: [{ id }, projectScopeWhere(actor)] },
      select: { id: true, team_id: true, status: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  private async requireManageable(actor: AuthenticatedUser, id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      select: { id: true, team_id: true, status: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    if (!canManageProject(actor, project)) {
      throw new ForbiddenException('Cannot modify this project');
    }
    return project;
  }

  private async computeDerivedProgress(projectId: string): Promise<number> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        deliverables: { select: { is_done: true } },
        tasks: { select: { status: true } },
      },
    });
    if (!project) return 0;
    return deriveProgress(project);
  }
}

function deriveProgress(row: {
  deliverables: { is_done: boolean }[];
  tasks: { status: string }[];
}): number {
  const totalDeliverables = row.deliverables.length;
  const doneDeliverables = row.deliverables.filter((d) => d.is_done).length;
  const totalTasks = row.tasks.length;
  const completedTasks = row.tasks.filter((t) => t.status === 'completed').length;

  // If both signals are present, weight them equally; otherwise use whichever exists.
  if (totalDeliverables === 0 && totalTasks === 0) return 0;
  if (totalDeliverables === 0) return Math.round((completedTasks / totalTasks) * 100);
  if (totalTasks === 0) return Math.round((doneDeliverables / totalDeliverables) * 100);
  const deliverablePct = (doneDeliverables / totalDeliverables) * 100;
  const taskPct = (completedTasks / totalTasks) * 100;
  return Math.round((deliverablePct + taskPct) / 2);
}

function deadlineRisk(
  deadline: Date | null,
  status: ProjectStatus,
): 'none' | 'approaching' | 'overdue' {
  if (!deadline) return 'none';
  if (TERMINAL_STATUSES.includes(status)) return 'none';
  const now = Date.now();
  if (deadline.getTime() < now) return 'overdue';
  const approachingAt = deadline.getTime() - APPROACHING_DAYS * 24 * 60 * 60 * 1000;
  if (approachingAt < now) return 'approaching';
  return 'none';
}

function decorate(row: ProjectListRow) {
  const deliverables_total = row.deliverables.length;
  const deliverables_done = row.deliverables.filter((d) => d.is_done).length;
  const tasks_total = row.tasks.length;
  const tasks_completed = row.tasks.filter((t) => t.status === 'completed').length;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    client_name: row.client_name,
    category: row.category,
    team_id: row.team_id,
    status: row.status,
    progress_pct: row.progress_pct,
    start_date: row.start_date,
    deadline: row.deadline,
    ai_risk_score: row.ai_risk_score,
    ai_risk_band: row.ai_risk_band,
    ai_risk_concern: row.ai_risk_concern,
    ai_risk_actions: row.ai_risk_actions as unknown as string[] | null,
    ai_risk_model: row.ai_risk_model,
    ai_risk_at: row.ai_risk_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    team: row.team,
    deliverables_total,
    deliverables_done,
    tasks_total,
    tasks_completed,
    derived_progress_pct: deriveProgress(row),
    deadline_risk: deadlineRisk(row.deadline, row.status),
  };
}

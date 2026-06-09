import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, TicketPriority, TicketStatus, TicketType } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { paginationFrom, type PaginatedResult } from '../../common/dto/pagination.dto';
import {
  canManageTicket,
  canRespondToTicket,
  ticketScopeWhere,
} from '../../common/utils/scope';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { AssignTicketDto } from './dto/assign-ticket.dto';
import type { CreateTicketDto } from './dto/create-ticket.dto';
import type { ListTicketsDto } from './dto/list-tickets.dto';
import type { SendTicketMessageDto } from './dto/send-message.dto';
import type { UpdateTicketStatusDto } from './dto/update-status.dto';

/**
 * Hours since `created_at` after which an open/in_progress ticket is flagged
 * "unattended" on dashboards (FR-TKT-6). Tune later via ScoringConfig.
 */
const UNATTENDED_HOURS_BY_PRIORITY: Record<TicketPriority, number> = {
  urgent: 4,
  high: 12,
  medium: 24,
  low: 72,
};

const TICKET_LIST_SELECT = {
  id: true,
  raised_by: true,
  type: true,
  priority: true,
  title: true,
  description: true,
  status: true,
  assigned_to: true,
  team_id: true,
  created_at: true,
  updated_at: true,
  closed_at: true,
  raiser: { select: { id: true, full_name: true, email: true } },
  assignee: { select: { id: true, full_name: true } },
  team: { select: { id: true, name: true } },
  _count: { select: { messages: true } },
} satisfies Prisma.TicketSelect;

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(actor: AuthenticatedUser, query: ListTicketsDto): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip } = paginationFrom(query);
    const where: Prisma.TicketWhereInput = {
      AND: [
        ticketScopeWhere(actor),
        query.status ? { status: query.status } : {},
        query.type ? { type: query.type } : {},
        query.priority ? { priority: query.priority } : {},
        query.team_id ? { team_id: query.team_id } : {},
        query.assigned_to ? { assigned_to: query.assigned_to } : {},
        query.raised_by ? { raised_by: query.raised_by } : {},
        query.mine
          ? { OR: [{ raised_by: actor.id }, { assigned_to: actor.id }] }
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
      this.prisma.ticket.findMany({
        where,
        select: TICKET_LIST_SELECT,
        orderBy: [
          { status: 'asc' },
          { priority: 'desc' },
          { created_at: 'desc' },
        ],
        take: limit,
        skip,
      }),
      this.prisma.ticket.count({ where }),
    ]);

    let decorated = rows.map(decorate);
    if (query.unattended) {
      decorated = decorated.filter((t) => t.is_unattended);
    }

    return { data: decorated, meta: { page, limit, total } };
  }

  async getOne(actor: AuthenticatedUser, id: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { AND: [{ id }, ticketScopeWhere(actor)] },
      select: {
        ...TICKET_LIST_SELECT,
        messages: {
          orderBy: { created_at: 'asc' },
          take: 200,
          select: {
            id: true,
            ticket_id: true,
            sender_id: true,
            message: true,
            created_at: true,
            sender: { select: { id: true, full_name: true, role: true } },
          },
        },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    const { messages, ...rest } = ticket;
    return { ...decorate(rest), messages };
  }

  async create(actor: AuthenticatedUser, dto: CreateTicketDto) {
    if (dto.team_id) {
      const team = await this.prisma.team.findUnique({
        where: { id: dto.team_id },
        select: { id: true },
      });
      if (!team) throw new BadRequestException('team_id does not exist');
    }
    const assigneeId = await this.routeTicket(dto.type, dto.team_id ?? null);

    return this.prisma.ticket.create({
      data: {
        raised_by: actor.id,
        type: dto.type,
        priority: dto.priority ?? TicketPriority.medium,
        title: dto.title,
        description: dto.description,
        team_id: dto.team_id ?? null,
        assigned_to: assigneeId,
        status: TicketStatus.open,
      },
      select: TICKET_LIST_SELECT,
    });
  }

  async changeStatus(actor: AuthenticatedUser, id: string, dto: UpdateTicketStatusDto) {
    const existing = await this.fetchForAction(id);

    const isRaiser = existing.raised_by === actor.id;
    const canAct = canManageTicket(actor, existing);
    // Raisers can reopen their own ticket once it's resolved/closed; everything
    // else requires manage permission.
    const reopening = dto.status === TicketStatus.open && existing.status !== TicketStatus.open;
    const allowed = canAct || (isRaiser && reopening);
    if (!allowed) {
      throw new ForbiddenException('Cannot change this ticket’s status');
    }

    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.update({
        where: { id: existing.id },
        data: {
          status: dto.status,
          closed_at: dto.status === TicketStatus.closed ? new Date() : null,
        },
        select: TICKET_LIST_SELECT,
      });
      const noteParts = [`Status: ${existing.status} → ${dto.status}`];
      if (dto.message?.trim()) noteParts.push(dto.message.trim());
      await tx.ticketMessage.create({
        data: {
          ticket_id: existing.id,
          sender_id: actor.id,
          message: noteParts.join(' — '),
        },
      });
      const recipients = [existing.raised_by, existing.assigned_to].filter(
        (v): v is string => !!v,
      );
      void this.notifications.notifyTicketStatusChanged(
        existing.id,
        recipients,
        dto.status,
        actor.id,
      );
      return decorate(ticket);
    });
  }

  async assign(actor: AuthenticatedUser, id: string, dto: AssignTicketDto) {
    if (actor.role !== Role.super_admin && actor.role !== Role.team_leader) {
      throw new ForbiddenException('Only admins or team leaders can reassign tickets');
    }
    const existing = await this.fetchForAction(id);
    if (!canManageTicket(actor, existing)) {
      throw new ForbiddenException('Cannot manage this ticket');
    }
    const newAssignee = await this.prisma.user.findUnique({
      where: { id: dto.assignee_id },
      select: { id: true, status: true },
    });
    if (!newAssignee) throw new BadRequestException('assignee_id does not exist');
    if (newAssignee.status !== 'active') {
      throw new BadRequestException('Assignee is not active');
    }

    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.update({
        where: { id: existing.id },
        data: { assigned_to: dto.assignee_id },
        select: TICKET_LIST_SELECT,
      });
      await tx.ticketMessage.create({
        data: {
          ticket_id: existing.id,
          sender_id: actor.id,
          message: `Assigned to user ${dto.assignee_id}`,
        },
      });
      return decorate(ticket);
    });
  }

  async postMessage(actor: AuthenticatedUser, id: string, dto: SendTicketMessageDto) {
    const ticket = await this.fetchForAction(id);
    if (!canRespondToTicket(actor, ticket)) {
      throw new ForbiddenException('Cannot post on this ticket');
    }
    // Posting on an "open" ticket auto-bumps it to in_progress when the
    // sender is the assignee or someone managing it, mirroring helpdesk flow.
    const shouldAdvance =
      ticket.status === TicketStatus.open && canManageTicket(actor, ticket);

    return this.prisma.$transaction(async (tx) => {
      const message = await tx.ticketMessage.create({
        data: {
          ticket_id: id,
          sender_id: actor.id,
          message: dto.message,
        },
        select: {
          id: true,
          ticket_id: true,
          sender_id: true,
          message: true,
          created_at: true,
          sender: { select: { id: true, full_name: true, role: true } },
        },
      });
      if (shouldAdvance) {
        await tx.ticket.update({
          where: { id },
          data: { status: TicketStatus.in_progress },
        });
      }
      const recipients = [ticket.raised_by, ticket.assigned_to].filter(
        (v): v is string => !!v,
      );
      void this.notifications.notifyTicketMessage(id, recipients, actor.id);
      return message;
    });
  }

  /**
   * Auto-routing per FR-TKT-4:
   *   technical / project_support → leader of the related team (else admin queue)
   *   leave_request / access_request / general → admin queue (null)
   * Always falls back to null when the chosen route has no eligible leader.
   */
  private async routeTicket(type: TicketType, teamId: string | null): Promise<string | null> {
    const teamRouted = type === TicketType.technical || type === TicketType.project_support;
    if (!teamRouted) return null;
    if (!teamId) return null;
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { leader_id: true },
    });
    return team?.leader_id ?? null;
  }

  private async fetchForAction(id: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        raised_by: true,
        assigned_to: true,
        team_id: true,
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }
}

interface DecorateRow {
  id: string;
  status: TicketStatus;
  priority: TicketPriority;
  created_at: Date;
  closed_at: Date | null;
  [key: string]: unknown;
}

function decorate<T extends DecorateRow>(row: T): T & { age_hours: number; is_unattended: boolean } {
  const reference = row.closed_at ?? new Date();
  const age_hours =
    (reference.getTime() - row.created_at.getTime()) / (1000 * 60 * 60);
  const threshold = UNATTENDED_HOURS_BY_PRIORITY[row.priority];
  const isOpenish = row.status === TicketStatus.open || row.status === TicketStatus.in_progress;
  return {
    ...row,
    age_hours: Math.round(age_hours * 10) / 10,
    is_unattended: isOpenish && age_hours > threshold,
  };
}

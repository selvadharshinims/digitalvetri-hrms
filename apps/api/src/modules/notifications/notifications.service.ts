import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { paginationFrom } from '../../common/dto/pagination.dto';
import {
  isWorkingDay,
  startOfDay,
  todayAtTime,
} from '../../common/utils/working-days';
import { PrismaService } from '../../prisma/prisma.service';
import type { ListNotificationsDto } from './dto/list-notifications.dto';
import type { MarkReadDto } from './dto/mark-read.dto';
import { EmailService } from './email.service';
import { WhatsAppService } from './whatsapp.service';

export type NotificationType =
  | 'task_assigned'
  | 'task_reviewed'
  | 'project_updated'
  | 'lead_assigned'
  | 'lead_followup_due'
  | 'ticket_response'
  | 'ticket_status_changed'
  | 'attendance_reminder'
  | 'report_reminder'
  | 'feedback_received'
  | 'system';

interface CreatePayload {
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  /** Suppress email even if user has email configured. */
  in_app_only?: boolean;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  // ───────────────────────── reads ───────────────────────────────────────────

  async list(actor: AuthenticatedUser, query: ListNotificationsDto) {
    const { page, limit, skip } = paginationFrom(query);
    const where = {
      user_id: actor.id,
      ...(query.unread_only ? { is_read: false } : {}),
      ...(query.type ? { type: query.type } : {}),
    };
    const [rows, total, unread] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: limit,
        skip,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: { user_id: actor.id, is_read: false },
      }),
    ]);
    return { data: rows, meta: { page, limit, total, unread } };
  }

  async unreadCount(actor: AuthenticatedUser) {
    const unread = await this.prisma.notification.count({
      where: { user_id: actor.id, is_read: false },
    });
    return { unread };
  }

  async markRead(actor: AuthenticatedUser, dto: MarkReadDto) {
    if (dto.all) {
      const result = await this.prisma.notification.updateMany({
        where: { user_id: actor.id, is_read: false },
        data: { is_read: true },
      });
      return { updated: result.count };
    }
    if (!dto.notification_ids || dto.notification_ids.length === 0) {
      return { updated: 0 };
    }
    const result = await this.prisma.notification.updateMany({
      where: {
        user_id: actor.id,
        id: { in: dto.notification_ids },
      },
      data: { is_read: true },
    });
    return { updated: result.count };
  }

  // ───────────────────────── write (called from other services) ──────────────

  async createForUser(userId: string, payload: CreatePayload): Promise<void> {
    if (!userId) return;
    try {
      await this.prisma.notification.create({
        data: {
          user_id: userId,
          type: payload.type,
          title: payload.title,
          body: payload.body ?? null,
          link: payload.link ?? null,
        },
      });
      if (!payload.in_app_only) {
        await this.fanOutExternal(userId, payload);
      }
    } catch (err) {
      // Never let a notification failure cascade into the action that
      // produced it.
      this.logger.error(`Failed to create notification for ${userId}: ${(err as Error).message}`);
    }
  }

  async notifyTaskAssigned(taskId: string, assigneeId: string, byUserId: string) {
    if (assigneeId === byUserId) return;
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { title: true, priority: true, due_date: true },
    });
    if (!task) return;
    const byName = await this.userName(byUserId);
    await this.createForUser(assigneeId, {
      type: 'task_assigned',
      title: `New task: ${task.title}`,
      body: [
        `${byName} assigned this task to you.`,
        task.priority ? `Priority: ${task.priority}` : '',
        task.due_date ? `Due: ${task.due_date.toISOString().slice(0, 10)}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
      link: `/tasks/${taskId}`,
    });
  }

  async notifyTaskReviewed(
    taskId: string,
    assigneeId: string,
    decision: 'approve' | 'reopen',
    byUserId: string,
  ) {
    if (!assigneeId) return;
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { title: true },
    });
    if (!task) return;
    const byName = await this.userName(byUserId);
    const verb = decision === 'approve' ? 'approved' : 'reopened';
    await this.createForUser(assigneeId, {
      type: 'task_reviewed',
      title: `Task ${verb}: ${task.title}`,
      body: `${byName} ${verb} your task.`,
      link: `/tasks/${taskId}`,
    });
  }

  async notifyLeadAssigned(leadId: string, assigneeId: string, byUserId: string) {
    if (assigneeId === byUserId) return;
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: { name: true, next_follow_up: true },
    });
    if (!lead) return;
    const byName = await this.userName(byUserId);
    await this.createForUser(assigneeId, {
      type: 'lead_assigned',
      title: `New lead: ${lead.name}`,
      body: [
        `${byName} assigned this lead to you.`,
        lead.next_follow_up
          ? `Follow up by ${lead.next_follow_up.toISOString().slice(0, 10)}`
          : '',
      ]
        .filter(Boolean)
        .join(' · '),
      link: `/leads/${leadId}`,
    });
  }

  async notifyTicketMessage(
    ticketId: string,
    recipientIds: string[],
    senderId: string,
  ) {
    const filtered = recipientIds.filter((id) => id && id !== senderId);
    if (filtered.length === 0) return;
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { title: true },
    });
    if (!ticket) return;
    const senderName = await this.userName(senderId);
    await Promise.all(
      filtered.map((id) =>
        this.createForUser(id, {
          type: 'ticket_response',
          title: `New reply on: ${ticket.title}`,
          body: `${senderName} posted a message.`,
          link: `/tickets/${ticketId}`,
        }),
      ),
    );
  }

  async notifyTicketStatusChanged(
    ticketId: string,
    recipientIds: string[],
    to: string,
    byUserId: string,
  ) {
    const filtered = recipientIds.filter((id) => id && id !== byUserId);
    if (filtered.length === 0) return;
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { title: true },
    });
    if (!ticket) return;
    const byName = await this.userName(byUserId);
    await Promise.all(
      filtered.map((id) =>
        this.createForUser(id, {
          type: 'ticket_status_changed',
          title: `Ticket ${to.replace('_', ' ')}: ${ticket.title}`,
          body: `${byName} changed the status to ${to.replace('_', ' ')}.`,
          link: `/tickets/${ticketId}`,
        }),
      ),
    );
  }

  async notifyReportReviewed(reportId: string, authorId: string, byUserId: string) {
    const report = await this.prisma.dailyReport.findUnique({
      where: { id: reportId },
      select: { report_date: true },
    });
    if (!report) return;
    const byName = await this.userName(byUserId);
    await this.createForUser(authorId, {
      type: 'feedback_received',
      title: `Report acknowledged (${report.report_date.toISOString().slice(0, 10)})`,
      body: `${byName} reviewed your daily report.`,
      link: `/daily-reports/${reportId}`,
    });
  }

  async notifyFeedbackReceived(
    userId: string,
    periodEnd: Date,
    byUserId: string,
  ) {
    if (userId === byUserId) return;
    const byName = await this.userName(byUserId);
    await this.createForUser(userId, {
      type: 'feedback_received',
      title: 'New leader feedback',
      body: `${byName} left feedback for the period ending ${periodEnd
        .toISOString()
        .slice(0, 10)}.`,
      link: `/performance/${userId}`,
    });
  }

  // ───────────────────────── cron reminders ──────────────────────────────────

  /**
   * Report submission reminder. Fires at 18:30 local — 30 min before the
   * default 19:00 cutoff. Notifies any active intern/leader who hasn't
   * submitted today.
   */
  @Cron('30 18 * * *', { name: 'notifications-report-reminder' })
  async cronReportReminder() {
    const today = startOfDay(new Date());
    if (!isWorkingDay(today)) return;

    const eligible = await this.prisma.user.findMany({
      where: {
        status: 'active',
        role: { in: ['intern', 'team_leader'] },
        OR: [{ joining_date: null }, { joining_date: { lte: today } }],
        daily_reports: { none: { report_date: today } },
      },
      select: { id: true },
    });
    if (eligible.length === 0) return;

    await Promise.all(
      eligible.map((u) =>
        this.createForUser(u.id, {
          type: 'report_reminder',
          title: 'Daily report due',
          body: 'Submit a quick reflection on your day before the cutoff.',
          link: '/daily-reports',
        }),
      ),
    );
    this.logger.log(`Report reminder sent to ${eligible.length} users`);
  }

  /**
   * Attendance check-in reminder. Fires 30 min after the configured
   * work_start_time for users who haven't checked in.
   */
  @Cron('0 11 * * *', { name: 'notifications-attendance-reminder' })
  async cronAttendanceReminder() {
    const today = startOfDay(new Date());
    if (!isWorkingDay(today)) return;

    const config = await this.prisma.scoringConfig.findUnique({
      where: { is_active: true },
    });
    const startTime = todayAtTime(config?.work_start_time ?? '10:00');
    // Only nudge if we're actually past start.
    if (!startTime || Date.now() < startTime.getTime()) return;

    const eligible = await this.prisma.user.findMany({
      where: {
        status: 'active',
        role: { in: ['intern', 'team_leader'] },
        attendance_records: { none: { date: today } },
      },
      select: { id: true },
    });
    if (eligible.length === 0) return;

    await Promise.all(
      eligible.map((u) =>
        this.createForUser(u.id, {
          type: 'attendance_reminder',
          title: 'Check in for today',
          body: 'Tap the Attendance page to mark yourself present.',
          link: '/attendance',
        }),
      ),
    );
    this.logger.log(`Attendance reminder sent to ${eligible.length} users`);
  }

  // ───────────────────────── internals ───────────────────────────────────────

  /**
   * Fan out a notification to every external channel the user has opted into.
   * Each channel send is best-effort: a failure in one (e.g., WhatsApp window
   * closed) must not prevent the others.
   */
  private async fanOutExternal(userId: string, payload: CreatePayload): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, full_name: true, phone: true, whatsapp_enabled: true },
    });
    if (!user) return;

    const linkLine = payload.link ? `\nOpen: <link to ${payload.link}>` : '';
    const emailText = `Hi ${user.full_name},\n\n${payload.title}${
      payload.body ? `\n\n${payload.body}` : ''
    }${linkLine}\n\n— DV-WMS`;

    const sends: Promise<void>[] = [
      this.email.send({
        to: user.email,
        subject: `[DV-WMS] ${payload.title}`,
        text: emailText,
      }),
    ];

    if (user.whatsapp_enabled && user.phone) {
      // WhatsApp messages should be tighter than email — drop the salutation
      // and signoff but keep the title, body, and link line.
      const waBody = [payload.title, payload.body, linkLine.trim()]
        .filter(Boolean)
        .join('\n\n');
      sends.push(this.whatsapp.send({ to: user.phone, body: waBody }));
    }

    await Promise.all(sends);
  }

  private async userName(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { full_name: true },
    });
    return user?.full_name ?? 'A teammate';
  }
}

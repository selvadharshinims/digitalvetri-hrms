import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, Role } from '@prisma/client';
import { SYSTEM_ACTOR } from '../../common/constants/system-actor';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { paginationFrom, type PaginatedResult } from '../../common/dto/pagination.dto';
import {
  canReviewDailyReport,
  dailyReportScopeWhere,
  userScopeWhere,
} from '../../common/utils/scope';
import {
  isoDate,
  isWorkingDay,
  parseIsoDate,
  startOfDay,
  todayAtTime,
  workingDaysBetween,
} from '../../common/utils/working-days';
import { AnthropicService } from '../ai/anthropic.service';
import {
  DailyReportDigestService,
  type DigestInput,
} from '../ai/daily-report-digest.service';
import { EmailService } from '../notifications/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { DigestQueryDto } from './dto/digest.dto';
import type {
  ListDailyReportsDto,
  MissingReportsDto,
} from './dto/list-reports.dto';
import type { ReviewDailyReportDto } from './dto/review-report.dto';
import type { SubmitDailyReportDto } from './dto/submit-report.dto';

const REPORT_LIST_SELECT = {
  id: true,
  user_id: true,
  report_date: true,
  todays_work: true,
  challenges: true,
  learnings: true,
  tomorrows_plan: true,
  is_locked: true,
  reviewed_by: true,
  review_note: true,
  reviewed_at: true,
  submitted_late: true,
  created_at: true,
  updated_at: true,
  author: { select: { id: true, full_name: true, email: true } },
  reviewer: { select: { id: true, full_name: true } },
} satisfies Prisma.DailyReportSelect;

@Injectable()
export class DailyReportsService {
  private readonly logger = new Logger(DailyReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly digest: DailyReportDigestService,
    private readonly anthropic: AnthropicService,
    private readonly email: EmailService,
  ) {}

  /**
   * Workday morning AI digest. Generates yesterday's digest org-wide and
   * emails the markdown to every active super_admin and team_leader. No-op on
   * weekends and when Anthropic isn't configured.
   */
  @Cron('30 8 * * *', { name: 'daily-reports-digest-morning' })
  async cronMorningDigest() {
    if (!this.anthropic.isAvailable()) return;
    if (!isWorkingDay(new Date())) return;

    try {
      const result = await this.generateDigest(SYSTEM_ACTOR, { range: 'yesterday' });
      const recipients = await this.prisma.user.findMany({
        where: {
          status: 'active',
          role: { in: ['super_admin', 'team_leader'] },
        },
        select: { email: true, full_name: true },
      });
      if (recipients.length === 0) return;

      await Promise.all(
        recipients.map((r) =>
          this.email.send({
            to: r.email,
            subject: '[DV-WMS] Daily report digest',
            text: `Hi ${r.full_name},\n\nYesterday's team digest:\n\n${result.markdown}\n\n— DV-WMS`,
          }),
        ),
      );
      this.logger.log(
        `Digest cron: sent to ${recipients.length} recipient(s) (model: ${result.model})`,
      );
    } catch (err) {
      this.logger.error(`Digest cron failed: ${(err as Error).message}`);
    }
  }

  async list(actor: AuthenticatedUser, query: ListDailyReportsDto): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip } = paginationFrom(query);
    const where: Prisma.DailyReportWhereInput = {
      AND: [
        dailyReportScopeWhere(actor),
        query.user_id ? { user_id: query.user_id } : {},
        query.team_id
          ? { author: { memberships: { some: { team_id: query.team_id } } } }
          : {},
        query.from ? { report_date: { gte: parseIsoDate(query.from) } } : {},
        query.to ? { report_date: { lte: parseIsoDate(query.to) } } : {},
        query.pending_review ? { reviewed_at: null } : {},
        query.q
          ? {
              OR: [
                { todays_work: { contains: query.q, mode: 'insensitive' } },
                { challenges: { contains: query.q, mode: 'insensitive' } },
                { learnings: { contains: query.q, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.dailyReport.findMany({
        where,
        select: REPORT_LIST_SELECT,
        orderBy: [{ report_date: 'desc' }, { author: { full_name: 'asc' } }],
        take: limit,
        skip,
      }),
      this.prisma.dailyReport.count({ where }),
    ]);
    return { data: rows, meta: { page, limit, total } };
  }

  async getMine(actor: AuthenticatedUser, dateStr?: string) {
    const date = dateStr ? parseIsoDate(dateStr) : startOfDay(new Date());
    return this.prisma.dailyReport.findUnique({
      where: { user_id_report_date: { user_id: actor.id, report_date: date } },
      select: REPORT_LIST_SELECT,
    });
  }

  async submit(actor: AuthenticatedUser, dto: SubmitDailyReportDto) {
    const reportDate = dto.report_date ? parseIsoDate(dto.report_date) : startOfDay(new Date());
    const today = startOfDay(new Date());

    if (!isWorkingDay(reportDate)) {
      throw new BadRequestException('That date is not a working day');
    }
    if (reportDate.getTime() > today.getTime()) {
      throw new BadRequestException('Cannot submit a report for a future date');
    }

    // §FR-DWR-2: only today is editable; past days are locked.
    const isForToday = reportDate.getTime() === today.getTime();
    const existing = await this.prisma.dailyReport.findUnique({
      where: { user_id_report_date: { user_id: actor.id, report_date: reportDate } },
      select: { id: true, is_locked: true },
    });

    if (existing) {
      if (existing.is_locked || !isForToday) {
        throw new BadRequestException(
          'This report is locked. Reports can only be edited on the same working day.',
        );
      }
      return this.prisma.dailyReport.update({
        where: { id: existing.id },
        data: {
          todays_work: dto.todays_work,
          challenges: dto.challenges ?? null,
          learnings: dto.learnings ?? null,
          tomorrows_plan: dto.tomorrows_plan ?? null,
        },
        select: REPORT_LIST_SELECT,
      });
    }

    // Submitted-late check uses the configured cutoff time (defaults 19:00).
    let submittedLate = false;
    if (isForToday) {
      const config = await this.prisma.scoringConfig.findUnique({ where: { is_active: true } });
      const cutoff = todayAtTime(config?.report_cutoff ?? '19:00');
      submittedLate = !!cutoff && new Date().getTime() > cutoff.getTime();
    } else {
      // Submitting for an earlier date is always considered late.
      submittedLate = true;
    }

    return this.prisma.dailyReport.create({
      data: {
        user_id: actor.id,
        report_date: reportDate,
        todays_work: dto.todays_work,
        challenges: dto.challenges ?? null,
        learnings: dto.learnings ?? null,
        tomorrows_plan: dto.tomorrows_plan ?? null,
        is_locked: !isForToday,
        submitted_late: submittedLate,
      },
      select: REPORT_LIST_SELECT,
    });
  }

  async getOne(actor: AuthenticatedUser, id: string) {
    const report = await this.prisma.dailyReport.findFirst({
      where: { AND: [{ id }, dailyReportScopeWhere(actor)] },
      select: REPORT_LIST_SELECT,
    });
    if (!report) throw new NotFoundException('Daily report not found');
    return report;
  }

  async review(actor: AuthenticatedUser, id: string, dto: ReviewDailyReportDto) {
    const report = await this.prisma.dailyReport.findUnique({
      where: { id },
      select: {
        id: true,
        user_id: true,
        author: { select: { memberships: { select: { team_id: true } } } },
      },
    });
    if (!report) throw new NotFoundException('Daily report not found');

    const team_ids = report.author.memberships.map((m) => m.team_id);
    if (!canReviewDailyReport(actor, { id: report.user_id, team_ids })) {
      throw new ForbiddenException('Cannot review this report');
    }

    const updated = await this.prisma.dailyReport.update({
      where: { id: report.id },
      data: {
        reviewed_by: actor.id,
        review_note: dto.review_note ?? null,
        reviewed_at: dto.acknowledged ? new Date() : null,
      },
      select: REPORT_LIST_SELECT,
    });
    if (dto.acknowledged) {
      void this.notifications.notifyReportReviewed(report.id, report.user_id, actor.id);
    }
    return updated;
  }

  /**
   * Returns one row per visible active user with the working days (in the
   * scan window) for which they have no report.
   */
  async missing(actor: AuthenticatedUser, dto: MissingReportsDto) {
    if (actor.role === Role.intern) {
      throw new ForbiddenException('Interns cannot view missing-report exceptions');
    }
    const days = Math.max(1, Math.min(31, dto.days ?? 7));
    const today = startOfDay(new Date());
    const start = new Date(today);
    start.setDate(today.getDate() - (days - 1));
    const windowDays = workingDaysBetween(start, today);
    const windowSet = new Set(windowDays.map((d) => isoDate(d)));

    const userWhere: Prisma.UserWhereInput = {
      AND: [
        userScopeWhere(actor),
        { status: 'active' },
        { role: { in: ['intern', 'team_leader'] } },
        dto.team_id ? { memberships: { some: { team_id: dto.team_id } } } : {},
      ],
    };
    const users = await this.prisma.user.findMany({
      where: userWhere,
      select: {
        id: true,
        full_name: true,
        memberships: { select: { team_id: true } },
        joining_date: true,
        daily_reports: {
          where: { report_date: { gte: start, lte: today } },
          select: { report_date: true },
        },
      },
      orderBy: { full_name: 'asc' },
    });

    const out = users
      .map((u) => {
        const joining = u.joining_date ? startOfDay(u.joining_date) : null;
        const submitted = new Set(u.daily_reports.map((r) => isoDate(r.report_date)));
        const missingDates = [...windowSet].filter((d) => {
          if (submitted.has(d)) return false;
          if (joining && parseIsoDate(d).getTime() < joining.getTime()) return false;
          return true;
        });
        return {
          user_id: u.id,
          full_name: u.full_name,
          team_ids: u.memberships.map((m) => m.team_id),
          missing_dates: missingDates.sort(),
        };
      })
      .filter((r) => r.missing_dates.length > 0);

    return { window_days: windowDays.map(isoDate), users: out };
  }

  /**
   * AI-generated digest of the daily reports submitted by the caller's
   * visible cohort over a date window. Scope is the same as `list` — admins
   * see everyone, leaders see their teams. Interns get 403.
   */
  async generateDigest(actor: AuthenticatedUser, query: DigestQueryDto) {
    if (actor.role === Role.intern) {
      throw new ForbiddenException('Interns cannot run team digests');
    }

    const { start, end, label } = resolveDigestWindow(query);
    const workingDayCount = workingDaysBetween(start, end).length;

    // Active in-scope cohort (for "missing" detection + cohort counts).
    const userWhere: Prisma.UserWhereInput = {
      AND: [
        userScopeWhere(actor),
        { status: 'active' },
        { role: { in: ['intern', 'team_leader'] } },
        query.team_id ? { memberships: { some: { team_id: query.team_id } } } : {},
      ],
    };

    const cohort = await this.prisma.user.findMany({
      where: userWhere,
      select: {
        id: true,
        full_name: true,
        joining_date: true,
        memberships: { select: { team: { select: { name: true } } } },
        daily_reports: {
          where: { report_date: { gte: start, lte: end } },
          select: { report_date: true },
        },
      },
      orderBy: { full_name: 'asc' },
    });

    const cohortIds = new Set(cohort.map((u) => u.id));

    const reportsRaw = await this.prisma.dailyReport.findMany({
      where: {
        AND: [
          dailyReportScopeWhere(actor),
          { report_date: { gte: start, lte: end } },
          query.team_id
            ? { author: { memberships: { some: { team_id: query.team_id } } } }
            : {},
        ],
      },
      orderBy: { report_date: 'asc' },
      include: {
        author: {
          select: {
            id: true,
            full_name: true,
            memberships: { select: { team: { select: { name: true } } } },
          },
        },
      },
    });

    const reports = reportsRaw.map((r) => ({
      author_name: r.author.full_name,
      author_team_names: r.author.memberships.map((m) => m.team.name),
      report_date: r.report_date.toISOString(),
      todays_work: r.todays_work,
      challenges: r.challenges,
      learnings: r.learnings,
      tomorrows_plan: r.tomorrows_plan,
      submitted_late: r.submitted_late,
    }));

    const windowDayIsos = workingDaysBetween(start, end).map(isoDate);
    const windowSet = new Set(windowDayIsos);
    const missing = cohort
      .map((u) => {
        const joining = u.joining_date ? startOfDay(u.joining_date) : null;
        const submitted = new Set(u.daily_reports.map((r) => isoDate(r.report_date)));
        const missing_dates = [...windowSet].filter((d) => {
          if (submitted.has(d)) return false;
          if (joining && parseIsoDate(d).getTime() < joining.getTime()) return false;
          return true;
        });
        return {
          name: u.full_name,
          team_names: u.memberships.map((m) => m.team.name),
          missing_dates: missing_dates.sort(),
        };
      })
      .filter((m) => m.missing_dates.length > 0);

    const submittersWithReport = new Set(
      reportsRaw.filter((r) => cohortIds.has(r.user_id)).map((r) => r.user_id),
    );

    const scopeLabel =
      actor.role === Role.super_admin
        ? query.team_id
          ? 'One team'
          : 'Entire organization'
        : 'Your team(s)';

    const input: DigestInput = {
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
        working_days: workingDayCount,
        label,
      },
      scope_label: scopeLabel,
      cohort: {
        in_scope: cohort.length,
        submitted: submittersWithReport.size,
        missing: missing.length,
      },
      reports,
      missing,
    };

    const result = await this.digest.generate(input);
    return {
      markdown: result.markdown,
      model: result.model,
      usage: result.usage,
      period_start: start.toISOString(),
      period_end: end.toISOString(),
      period_label: label,
      reports_total: reports.length,
      missing_total: missing.length,
      generated_at: new Date().toISOString(),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Date-range resolver for the digest endpoint
// ─────────────────────────────────────────────────────────────────────────────

function resolveDigestWindow(
  query: DigestQueryDto,
): { start: Date; end: Date; label: string } {
  const today = startOfDay(new Date());

  if (query.range === 'yesterday') {
    const y = new Date(today);
    y.setDate(today.getDate() - 1);
    return { start: y, end: y, label: 'Yesterday' };
  }
  if (query.range === 'this_week') {
    // Monday-anchored — DV-WMS treats Mon-Sat as working days.
    const day = today.getDay();
    const back = day === 0 ? 6 : day - 1;
    const monday = new Date(today);
    monday.setDate(today.getDate() - back);
    return { start: monday, end: today, label: 'This week' };
  }
  if (query.range === 'last_7_days' || (!query.range && !query.from && !query.to)) {
    const start = new Date(today);
    start.setDate(today.getDate() - 6);
    return { start, end: today, label: 'Last 7 days' };
  }

  // custom or explicit from/to
  const from = query.from ? parseIsoDate(query.from) : new Date(today);
  const to = query.to ? parseIsoDate(query.to) : today;
  return { start: from, end: to, label: 'Custom range' };
}

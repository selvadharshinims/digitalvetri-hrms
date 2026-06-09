import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, Role } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import {
  endOfDay,
  isoDate,
  startOfDay,
  workingDaysBetween,
} from '../../common/utils/working-days';
import {
  PerformanceNarrativeService,
  type NarrativeInput,
} from '../ai/performance-narrative.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { GetScoreDto } from './dto/get-score.dto';
import type { LeaderboardDto } from './dto/leaderboard.dto';
import type { SubmitFeedbackDto } from './dto/submit-feedback.dto';
import {
  assertValidWeights,
  composeScore,
  DEFAULT_WEIGHTS_FRACTION,
  deriveAttendance,
  deriveDiscipline,
  deriveFeedback,
  deriveLead,
  deriveProject,
  deriveTask,
  scoreBand,
  type WeightsFraction,
} from './scoring/formulas';

const DEFAULT_PERIOD_DAYS = 30;

interface Period {
  start: Date;
  end: Date;
}

@Injectable()
export class PerformanceService {
  private readonly logger = new Logger(PerformanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly narrative: PerformanceNarrativeService,
  ) {}

  // ───────────────────────── public API ──────────────────────────────────────

  async getScore(actor: AuthenticatedUser, userId: string, query: GetScoreDto) {
    await this.assertReadable(actor, userId);
    const period = await this.resolvePeriod(query);

    if (!query.recompute) {
      const cached = await this.prisma.performanceScore.findUnique({
        where: {
          user_id_period_start_period_end: {
            user_id: userId,
            period_start: period.start,
            period_end: period.end,
          },
        },
      });
      if (cached) return this.shapeScoreRow(cached);
    }

    return this.computeAndPersist(userId, period);
  }

  async listMyHistory(actor: AuthenticatedUser, userId: string) {
    await this.assertReadable(actor, userId);
    const rows = await this.prisma.performanceScore.findMany({
      where: { user_id: userId },
      orderBy: { period_end: 'desc' },
      take: 24,
    });
    return rows.map((r) => this.shapeScoreRow(r));
  }

  async leaderboard(actor: AuthenticatedUser, query: LeaderboardDto) {
    const limit = query.limit ?? 50;
    const today = startOfDay(new Date());
    const period = await this.resolvePeriod({ rolling_days: DEFAULT_PERIOD_DAYS });

    const userWhere: Prisma.UserWhereInput = {
      AND: [
        { status: 'active' },
        { role: { in: ['intern', 'team_leader'] } },
        query.team_id ? { memberships: { some: { team_id: query.team_id } } } : {},
      ],
    };

    // Scope: leaders constrained to their team(s); interns to their teams.
    if (actor.role === Role.team_leader && !query.team_id) {
      userWhere.AND = [
        ...(userWhere.AND as Prisma.UserWhereInput[]),
        { memberships: { some: { team_id: { in: actor.led_team_ids } } } },
      ];
    } else if (actor.role === Role.intern && !query.team_id) {
      userWhere.AND = [
        ...(userWhere.AND as Prisma.UserWhereInput[]),
        { memberships: { some: { team_id: { in: actor.member_team_ids } } } },
      ];
    }

    const users = await this.prisma.user.findMany({
      where: userWhere,
      select: {
        id: true,
        full_name: true,
        memberships: { select: { team_id: true } },
        performance_scores: {
          where: { period_end: today },
          orderBy: { period_end: 'desc' },
          take: 1,
        },
      },
      take: limit,
    });

    // Ensure everyone has a score for the current rolling period.
    const enriched = await Promise.all(
      users.map(async (u) => {
        let scoreRow = u.performance_scores[0];
        if (!scoreRow) {
          scoreRow = (await this.computeAndPersistRaw(u.id, period)) as typeof scoreRow;
        }
        return {
          user_id: u.id,
          full_name: u.full_name,
          team_ids: u.memberships.map((m) => m.team_id),
          total_score: Number(scoreRow.total_score),
          task_score: Number(scoreRow.task_score),
          lead_score: Number(scoreRow.lead_score),
          band: scoreBand(Number(scoreRow.total_score)),
        };
      }),
    );

    // Tie-breakers per PRD §10.5: total → task → lead
    enriched.sort((a, b) => {
      if (b.total_score !== a.total_score) return b.total_score - a.total_score;
      if (b.task_score !== a.task_score) return b.task_score - a.task_score;
      return b.lead_score - a.lead_score;
    });

    return enriched.map((row, idx) => ({ ...row, rank: idx + 1 }));
  }

  async submitFeedback(actor: AuthenticatedUser, dto: SubmitFeedbackDto) {
    if (actor.role !== Role.super_admin && actor.role !== Role.team_leader) {
      throw new ForbiddenException('Only admins or team leaders can submit feedback');
    }
    if (actor.id === dto.user_id) {
      throw new ForbiddenException('Cannot submit feedback on yourself');
    }
    if (actor.role === Role.team_leader) {
      const target = await this.prisma.user.findUnique({
        where: { id: dto.user_id },
        select: { memberships: { select: { team_id: true } } },
      });
      if (!target) throw new NotFoundException('Target user not found');
      const overlap = target.memberships.some((m) => actor.led_team_ids.includes(m.team_id));
      if (!overlap) throw new ForbiddenException('Cannot give feedback outside your teams');
    }

    const periodStart = startOfDay(new Date(dto.period_start));
    const periodEnd = endOfDay(new Date(dto.period_end));

    const feedback = await this.prisma.performanceFeedback.upsert({
      where: {
        user_id_leader_id_period_start_period_end: {
          user_id: dto.user_id,
          leader_id: actor.id,
          period_start: periodStart,
          period_end: periodEnd,
        },
      },
      create: {
        user_id: dto.user_id,
        leader_id: actor.id,
        period_start: periodStart,
        period_end: periodEnd,
        quality: dto.quality,
        ownership: dto.ownership,
        collaboration: dto.collaboration,
        note: dto.note ?? null,
      },
      update: {
        quality: dto.quality,
        ownership: dto.ownership,
        collaboration: dto.collaboration,
        note: dto.note ?? null,
      },
    });
    void this.notifications.notifyFeedbackReceived(dto.user_id, periodEnd, actor.id);
    return feedback;
  }

  async listFeedback(actor: AuthenticatedUser, userId: string) {
    await this.assertReadable(actor, userId);
    return this.prisma.performanceFeedback.findMany({
      where: { user_id: userId },
      orderBy: { period_end: 'desc' },
      take: 24,
      include: { leader: { select: { id: true, full_name: true } } },
    });
  }

  /**
   * AI-generated performance narrative. Scope-checks the caller, gathers the
   * latest stored score + recent reports + recent feedback for the user, and
   * delegates to the narrative service (which calls Claude). The narrative
   * service returns markdown + usage metadata; we surface both.
   */
  async generateAiAnalysis(actor: AuthenticatedUser, userId: string) {
    await this.assertReadable(actor, userId);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        full_name: true,
        role: true,
        internship_role: true,
        joining_date: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');

    // Latest stored score — recompute on the fly if none exists so the
    // narrative is grounded in fresh data.
    const period = await this.resolvePeriod({});
    let scoreRow = await this.prisma.performanceScore.findUnique({
      where: {
        user_id_period_start_period_end: {
          user_id: userId,
          period_start: period.start,
          period_end: period.end,
        },
      },
    });
    if (!scoreRow) {
      scoreRow = await this.computeAndPersistRaw(userId, period);
    }

    const periodStart = scoreRow.period_start;
    const periodEnd = scoreRow.period_end;
    const workingDays = workingDaysBetween(periodStart, periodEnd).length;

    const [reports, feedback] = await Promise.all([
      this.prisma.dailyReport.findMany({
        where: {
          user_id: userId,
          report_date: { gte: periodStart, lte: endOfDay(periodEnd) },
        },
        orderBy: { report_date: 'desc' },
        take: 14,
        select: {
          report_date: true,
          todays_work: true,
          challenges: true,
          learnings: true,
          tomorrows_plan: true,
          submitted_late: true,
        },
      }),
      this.prisma.performanceFeedback.findMany({
        where: { user_id: userId },
        orderBy: { period_end: 'desc' },
        take: 3,
        include: { leader: { select: { full_name: true } } },
      }),
    ]);

    const totalScore = Number(scoreRow.total_score);
    const input: NarrativeInput = {
      user: {
        full_name: user.full_name,
        role: user.role,
        internship_role: user.internship_role,
        joining_date: user.joining_date ? user.joining_date.toISOString() : null,
      },
      period: {
        start: periodStart.toISOString(),
        end: periodEnd.toISOString(),
        working_days: workingDays,
      },
      score: {
        total: totalScore,
        band: scoreBand(totalScore),
        attendance: Number(scoreRow.attendance_score),
        task: Number(scoreRow.task_score),
        lead: Number(scoreRow.lead_score),
        project: Number(scoreRow.project_score),
        feedback: Number(scoreRow.feedback_score),
        discipline: Number(scoreRow.discipline_score),
        weights_used: scoreRow.weights_used as unknown as Record<string, number>,
      },
      daily_reports: reports.map((r) => ({
        report_date: r.report_date.toISOString(),
        todays_work: r.todays_work,
        challenges: r.challenges,
        learnings: r.learnings,
        tomorrows_plan: r.tomorrows_plan,
        submitted_late: r.submitted_late,
      })),
      leader_feedback: feedback.map((f) => ({
        period_start: f.period_start.toISOString(),
        period_end: f.period_end.toISOString(),
        leader_name: f.leader.full_name,
        quality: f.quality,
        ownership: f.ownership,
        collaboration: f.collaboration,
        note: f.note,
      })),
    };

    const result = await this.narrative.generate(input);
    return {
      markdown: result.markdown,
      model: result.model,
      usage: result.usage,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      generated_at: new Date().toISOString(),
    };
  }

  /** Admin-triggered org-wide recompute. */
  async recomputeAll(actor: AuthenticatedUser) {
    if (actor.role !== Role.super_admin) {
      throw new ForbiddenException('Only the Super Admin can recompute org-wide');
    }
    return this.runOrgRecompute('manual');
  }

  // ───────────────────────── scheduled job ───────────────────────────────────

  /** Nightly recompute at 01:00 local time. */
  @Cron('0 1 * * *', { name: 'performance-nightly' })
  async nightlyRecompute() {
    await this.runOrgRecompute('cron');
  }

  // ───────────────────────── internals ───────────────────────────────────────

  private async runOrgRecompute(trigger: 'manual' | 'cron') {
    const period = await this.resolvePeriod({ rolling_days: DEFAULT_PERIOD_DAYS });
    const users = await this.prisma.user.findMany({
      where: { status: 'active', role: { in: ['intern', 'team_leader'] } },
      select: { id: true },
    });
    let ok = 0;
    let failed = 0;
    for (const u of users) {
      try {
        await this.computeAndPersistRaw(u.id, period);
        ok += 1;
      } catch (e) {
        failed += 1;
        this.logger.error(`Recompute failed for ${u.id}: ${(e as Error).message}`);
      }
    }
    this.logger.log(
      `Performance recompute (${trigger}): ${ok} ok, ${failed} failed; period ${isoDate(period.start)} → ${isoDate(period.end)}`,
    );
    return { computed: ok, failed, period_start: isoDate(period.start), period_end: isoDate(period.end) };
  }

  private async resolvePeriod(query: GetScoreDto): Promise<Period> {
    const today = startOfDay(new Date());
    if (query.period_start && query.period_end) {
      return {
        start: startOfDay(new Date(query.period_start)),
        end: startOfDay(new Date(query.period_end)),
      };
    }
    const config = await this.prisma.scoringConfig.findUnique({ where: { is_active: true } });
    const days = query.rolling_days ?? config?.scoring_period_days ?? DEFAULT_PERIOD_DAYS;
    const start = new Date(today);
    start.setDate(today.getDate() - (days - 1));
    return { start: startOfDay(start), end: today };
  }

  private async computeAndPersist(userId: string, period: Period) {
    const row = await this.computeAndPersistRaw(userId, period);
    return this.shapeScoreRow(row);
  }

  private async computeAndPersistRaw(userId: string, period: Period) {
    const weights = await this.getWeights();
    const inputs = await this.gatherInputs(userId, period);

    const components = {
      attendance: deriveAttendance(inputs.attendance),
      task: deriveTask(inputs.task),
      lead: deriveLead(inputs.lead),
      project: deriveProject(inputs.project),
      feedback: deriveFeedback(inputs.feedback),
      discipline: deriveDiscipline(inputs.discipline),
    };
    const composed = composeScore(components, weights);

    return this.prisma.performanceScore.upsert({
      where: {
        user_id_period_start_period_end: {
          user_id: userId,
          period_start: period.start,
          period_end: period.end,
        },
      },
      create: {
        user_id: userId,
        period_start: period.start,
        period_end: period.end,
        attendance_score: components.attendance ?? 0,
        task_score: components.task ?? 0,
        lead_score: components.lead ?? 0,
        project_score: components.project ?? 0,
        feedback_score: components.feedback ?? 0,
        discipline_score: components.discipline ?? 0,
        total_score: composed.total_score,
        weights_used: composed.effective_weights as unknown as Prisma.InputJsonValue,
      },
      update: {
        attendance_score: components.attendance ?? 0,
        task_score: components.task ?? 0,
        lead_score: components.lead ?? 0,
        project_score: components.project ?? 0,
        feedback_score: components.feedback ?? 0,
        discipline_score: components.discipline ?? 0,
        total_score: composed.total_score,
        weights_used: composed.effective_weights as unknown as Prisma.InputJsonValue,
        computed_at: new Date(),
      },
    });
  }

  private async gatherInputs(userId: string, period: Period) {
    const periodEnd = endOfDay(period.end);
    const config = await this.prisma.scoringConfig.findUnique({ where: { is_active: true } });
    const targetWorked = config?.lead_activity_target ?? 20;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { joining_date: true },
    });
    const effectiveStart =
      user?.joining_date && user.joining_date.getTime() > period.start.getTime()
        ? startOfDay(user.joining_date)
        : period.start;
    const workingDaysCount = workingDaysBetween(effectiveStart, period.end).length;

    // Attendance counts
    const attendanceRows = await this.prisma.attendance.findMany({
      where: {
        user_id: userId,
        date: { gte: effectiveStart, lte: periodEnd },
      },
      select: { status: true },
    });
    const counts = { present: 0, late: 0, half_day: 0, leave: 0, absent: 0 };
    for (const r of attendanceRows) counts[r.status] += 1;

    // Tasks: assigned vs completed in period
    const assignedTasks = await this.prisma.task.findMany({
      where: {
        assignee_id: userId,
        created_at: { lte: periodEnd },
        OR: [{ completed_at: null }, { completed_at: { gte: period.start } }],
      },
      select: {
        id: true,
        status: true,
        due_date: true,
        completed_at: true,
        project_id: true,
      },
    });
    const completedInPeriod = assignedTasks.filter(
      (t) =>
        t.status === 'completed' &&
        t.completed_at !== null &&
        t.completed_at.getTime() >= period.start.getTime() &&
        t.completed_at.getTime() <= periodEnd.getTime(),
    );
    const onTime = completedInPeriod.filter(
      (t) => !t.due_date || (t.completed_at && t.completed_at.getTime() <= endOfDay(t.due_date).getTime()),
    );

    // Project subset (tasks linked to a project)
    const projectTasks = assignedTasks.filter((t) => t.project_id !== null);
    const projectTasksCompleted = projectTasks.filter((t) => t.status === 'completed');

    // Leads
    const [convertedCount, workedCount] = await Promise.all([
      this.prisma.lead.count({
        where: {
          assigned_to: userId,
          status: 'converted',
          converted_at: { gte: period.start, lte: periodEnd },
        },
      }),
      this.prisma.lead.count({
        where: {
          assigned_to: userId,
          last_activity_at: { gte: period.start, lte: periodEnd },
        },
      }),
    ]);

    // Daily reports
    const reports = await this.prisma.dailyReport.findMany({
      where: {
        user_id: userId,
        report_date: { gte: effectiveStart, lte: periodEnd },
      },
      select: { submitted_late: true },
    });
    const lateReports = reports.filter((r) => r.submitted_late).length;

    // Leader feedback (latest overlapping)
    const feedbackAgg = await this.prisma.performanceFeedback.findMany({
      where: {
        user_id: userId,
        period_end: { gte: period.start },
        period_start: { lte: periodEnd },
      },
      select: { quality: true, ownership: true, collaboration: true },
      orderBy: { period_end: 'desc' },
      take: 3,
    });
    const avgRating =
      feedbackAgg.length === 0
        ? null
        : feedbackAgg.reduce(
            (sum, f) => sum + (f.quality + f.ownership + f.collaboration) / 3,
            0,
          ) / feedbackAgg.length;

    return {
      attendance: {
        present_days: counts.present,
        half_days: counts.half_day,
        late_days: counts.late,
        working_days: workingDaysCount,
      },
      task: {
        assigned: assignedTasks.length,
        completed: completedInPeriod.length,
        on_time_completed: onTime.length,
      },
      lead: {
        worked: workedCount,
        converted: convertedCount,
        target_worked: targetWorked,
      },
      project: {
        project_tasks_total: projectTasks.length,
        project_tasks_completed: projectTasksCompleted.length,
      },
      feedback: { avg_rating: avgRating },
      discipline: {
        reports_submitted: reports.length,
        late_reports: lateReports,
        working_days: workingDaysCount,
      },
    };
  }

  private async getWeights(): Promise<WeightsFraction> {
    const config = await this.prisma.scoringConfig.findUnique({ where: { is_active: true } });
    const raw =
      (config?.weights as unknown as WeightsFraction | undefined) ?? DEFAULT_WEIGHTS_FRACTION;
    try {
      assertValidWeights(raw);
      return raw;
    } catch {
      this.logger.warn('ScoringConfig weights invalid; falling back to defaults');
      return DEFAULT_WEIGHTS_FRACTION;
    }
  }

  private async assertReadable(actor: AuthenticatedUser, userId: string) {
    if (actor.role === Role.super_admin) return;
    if (actor.id === userId) return;
    if (actor.role === Role.team_leader) {
      const overlap = await this.prisma.teamMember.findFirst({
        where: { user_id: userId, team_id: { in: actor.led_team_ids } },
        select: { id: true },
      });
      if (!overlap) throw new ForbiddenException('Out of scope');
      return;
    }
    throw new ForbiddenException('Out of scope');
  }

  private shapeScoreRow(row: {
    id: string;
    user_id: string;
    period_start: Date;
    period_end: Date;
    attendance_score: Prisma.Decimal;
    task_score: Prisma.Decimal;
    lead_score: Prisma.Decimal;
    project_score: Prisma.Decimal;
    feedback_score: Prisma.Decimal;
    discipline_score: Prisma.Decimal;
    total_score: Prisma.Decimal;
    weights_used: Prisma.JsonValue;
    computed_at: Date;
  }) {
    return {
      id: row.id,
      user_id: row.user_id,
      period_start: row.period_start.toISOString(),
      period_end: row.period_end.toISOString(),
      attendance_score: Number(row.attendance_score),
      task_score: Number(row.task_score),
      lead_score: Number(row.lead_score),
      project_score: Number(row.project_score),
      feedback_score: Number(row.feedback_score),
      discipline_score: Number(row.discipline_score),
      total_score: Number(row.total_score),
      weights_used: row.weights_used as unknown as WeightsFraction,
      band: scoreBand(Number(row.total_score)),
      computed_at: row.computed_at.toISOString(),
    };
  }
}

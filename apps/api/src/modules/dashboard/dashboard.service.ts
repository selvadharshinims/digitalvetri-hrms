import { ForbiddenException, Injectable } from '@nestjs/common';
import { LeadStatus, Prisma, Role } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import {
  attendanceScopeWhere,
  leadScopeWhere,
  projectScopeWhere,
  taskScopeWhere,
  teamScopeWhere,
  ticketScopeWhere,
  userScopeWhere,
} from '../../common/utils/scope';
import {
  endOfDay,
  isWorkingDay,
  startOfDay,
  workingDaysBetween,
} from '../../common/utils/working-days';
import {
  TeamProductivityService,
  type TeamRollup,
} from '../ai/team-productivity.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PerformanceService } from '../performance/performance.service';

const ALLOWED_INSIGHT_DAYS = new Set([7, 14, 30]);

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly performance: PerformanceService,
    private readonly teamProductivity: TeamProductivityService,
  ) {}

  async forUser(actor: AuthenticatedUser) {
    if (actor.role === Role.intern) {
      return { role: 'intern' as const, intern: await this.internDashboard(actor) };
    }
    const staff = await this.staffDashboard(actor);
    return {
      role: actor.role === Role.super_admin ? ('super_admin' as const) : ('team_leader' as const),
      staff,
    };
  }

  // ───────────────────────── team insights (AI) ──────────────────────────────

  /**
   * AI-written cross-team productivity narrative. Staff-only. Builds a per-
   * team rollup for the chosen window, then delegates to the team productivity
   * AI service.
   */
  async generateTeamInsights(actor: AuthenticatedUser, days: number) {
    if (actor.role === Role.intern) {
      throw new ForbiddenException('Interns cannot view team insights');
    }
    const window = ALLOWED_INSIGHT_DAYS.has(days) ? days : 7;
    const today = startOfDay(new Date());
    const start = new Date(today);
    start.setDate(today.getDate() - (window - 1));
    const workingDays = workingDaysBetween(start, today).length;

    const teams = await this.prisma.team.findMany({
      where: { AND: [teamScopeWhere(actor), { is_active: true }] },
      select: {
        id: true,
        name: true,
        category: true,
        leader: { select: { full_name: true } },
        members: {
          select: {
            user: {
              select: {
                id: true,
                full_name: true,
                status: true,
                performance_scores: {
                  orderBy: { period_end: 'desc' },
                  take: 1,
                  select: { total_score: true },
                },
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const rollups = await Promise.all(
      teams.map((t) => this.buildTeamRollup(t, start, today, workingDays)),
    );

    const scopeLabel =
      actor.role === Role.super_admin ? 'Entire organization' : 'Your team(s)';

    const result = await this.teamProductivity.generate({
      window: {
        start: start.toISOString(),
        end: today.toISOString(),
        working_days: workingDays,
        label: `Last ${window} days`,
      },
      scope_label: scopeLabel,
      teams: rollups,
    });

    return {
      markdown: result.markdown,
      model: result.model,
      usage: result.usage,
      window_start: start.toISOString(),
      window_end: today.toISOString(),
      window_days: window,
      teams_total: rollups.length,
      generated_at: new Date().toISOString(),
    };
  }

  private async buildTeamRollup(
    team: {
      id: string;
      name: string;
      category: string | null;
      leader: { full_name: string } | null;
      members: { user: { id: string; full_name: string; status: string; performance_scores: { total_score: Prisma.Decimal }[] } }[];
    },
    start: Date,
    end: Date,
    workingDays: number,
  ): Promise<TeamRollup> {
    const endBound = endOfDay(end);
    const activeMembers = team.members.filter((m) => m.user.status === 'active');
    const memberIds = activeMembers.map((m) => m.user.id);

    // Tasks — include tasks assigned to any team member, plus any task whose
    // project belongs to the team. If the team has zero active members the
    // assignee branch collapses but project-scoped tasks still show.
    const memberOrProject: Prisma.TaskWhereInput[] = [
      { project: { team_id: team.id } },
    ];
    if (memberIds.length > 0) {
      memberOrProject.push({ assignee_id: { in: memberIds } });
    }
    const [tasks, blockedTasks] = await Promise.all([
      this.prisma.task.findMany({
        where: {
          OR: memberOrProject,
          updated_at: { gte: start, lte: endBound },
        },
        select: { status: true, due_date: true, completed_at: true, block_reason: true },
      }),
      this.prisma.task.findMany({
        where: {
          OR: memberOrProject,
          status: 'blocked',
        },
        select: { block_reason: true },
        take: 5,
      }),
    ]);

    let tasksCompleted = 0;
    let tasksInProgress = 0;
    let tasksInReview = 0;
    let tasksBlocked = 0;
    let tasksOverdue = 0;
    const now = Date.now();
    for (const t of tasks) {
      if (t.status === 'completed') {
        if (t.completed_at && t.completed_at.getTime() >= start.getTime()) tasksCompleted += 1;
      } else if (t.status === 'in_progress') tasksInProgress += 1;
      else if (t.status === 'in_review') tasksInReview += 1;
      else if (t.status === 'blocked') tasksBlocked += 1;
      if (t.due_date && t.due_date.getTime() < now && t.status !== 'completed') {
        tasksOverdue += 1;
      }
    }
    const blockedReasonsExcerpts = blockedTasks
      .map((t) => (t.block_reason ?? '').trim())
      .filter((r) => r.length > 0)
      .map((r) => r.slice(0, 140));

    // Leads
    const [leadsConverted, leadsWorked] = await Promise.all([
      this.prisma.lead.findMany({
        where: {
          team_id: team.id,
          status: 'converted',
          converted_at: { gte: start, lte: endBound },
        },
        select: { deal_value: true },
      }),
      this.prisma.lead.count({
        where: {
          team_id: team.id,
          OR: [
            { last_activity_at: { gte: start, lte: endBound } },
            { converted_at: { gte: start, lte: endBound } },
          ],
        },
      }),
    ]);
    const totalDealValue = leadsConverted.reduce(
      (s, l) => s + (l.deal_value ? Number(l.deal_value) : 0),
      0,
    );
    const conversionRate =
      leadsWorked > 0 ? Math.round((leadsConverted.length / leadsWorked) * 100) : 0;

    // Attendance
    const attendanceRows =
      memberIds.length > 0
        ? await this.prisma.attendance.findMany({
            where: {
              user_id: { in: memberIds },
              date: { gte: start, lte: endBound },
            },
            select: { user_id: true, status: true },
          })
        : [];
    const perUserPresent = new Map<string, number>();
    for (const id of memberIds) perUserPresent.set(id, 0);
    for (const r of attendanceRows) {
      if (r.status === 'present' || r.status === 'late') {
        perUserPresent.set(r.user_id, (perUserPresent.get(r.user_id) ?? 0) + 1);
      } else if (r.status === 'half_day') {
        perUserPresent.set(r.user_id, (perUserPresent.get(r.user_id) ?? 0) + 0.5);
      }
    }
    const userPcts = [...perUserPresent.values()].map((c) =>
      workingDays > 0 ? (c / workingDays) * 100 : 0,
    );
    const attendanceAvg =
      userPcts.length === 0
        ? 0
        : Math.round(userPcts.reduce((s, v) => s + v, 0) / userPcts.length);

    // Daily reports
    const reportsSubmitted =
      memberIds.length > 0
        ? await this.prisma.dailyReport.count({
            where: {
              user_id: { in: memberIds },
              report_date: { gte: start, lte: endBound },
            },
          })
        : 0;
    const reportsExpected = workingDays * memberIds.length;

    // Performance: members' latest stored scores
    const scored = activeMembers
      .map((m) => ({
        name: m.user.full_name,
        score: m.user.performance_scores[0]
          ? Number(m.user.performance_scores[0].total_score)
          : null,
      }))
      .filter((s): s is { name: string; score: number } => s.score !== null);
    const avgPerfScore =
      scored.length === 0
        ? null
        : Math.round(scored.reduce((s, v) => s + v.score, 0) / scored.length);
    const sortedByScore = [...scored].sort((a, b) => b.score - a.score);
    const topMember = sortedByScore[0] ?? null;
    const weakestMember =
      sortedByScore.length > 1 ? sortedByScore[sortedByScore.length - 1] : null;

    // Highest individual open-task load
    const openTasksByUser =
      memberIds.length > 0
        ? await this.prisma.task.groupBy({
            by: ['assignee_id'],
            where: {
              assignee_id: { in: memberIds },
              status: { notIn: ['completed'] },
            },
            _count: { _all: true },
          })
        : [];
    let highestIndividualLoad: TeamRollup['highest_individual_load'] = null;
    if (openTasksByUser.length > 0) {
      const top = [...openTasksByUser].sort(
        (a, b) => b._count._all - a._count._all,
      )[0]!;
      const memberName = activeMembers.find((m) => m.user.id === top.assignee_id)?.user
        .full_name;
      if (memberName) {
        highestIndividualLoad = { name: memberName, open_tasks: top._count._all };
      }
    }

    return {
      team_id: team.id,
      team_name: team.name,
      category: team.category,
      member_count: activeMembers.length,
      leader_name: team.leader?.full_name ?? null,
      tasks_completed: tasksCompleted,
      tasks_in_progress: tasksInProgress,
      tasks_in_review: tasksInReview,
      tasks_blocked: tasksBlocked,
      tasks_overdue: tasksOverdue,
      blocked_reasons_excerpts: blockedReasonsExcerpts,
      leads_worked: leadsWorked,
      leads_converted: leadsConverted.length,
      conversion_rate_pct: conversionRate,
      total_deal_value: Math.round(totalDealValue),
      attendance_avg_pct: attendanceAvg,
      reports_submitted: reportsSubmitted,
      reports_expected: reportsExpected,
      avg_perf_score: avgPerfScore,
      top_member: topMember,
      weakest_member: weakestMember,
      highest_individual_load: highestIndividualLoad,
    };
  }

  // ───────────────────────── staff (owner + leader) ──────────────────────────

  private async staffDashboard(actor: AuthenticatedUser) {
    const today = startOfDay(new Date());
    const todayEnd = endOfDay(today);

    const [
      kpis,
      attendanceToday,
      funnel,
      topPerformers,
      teamPerformance,
      exceptions,
      pendingReview,
    ] = await Promise.all([
      this.computeKpis(actor),
      this.computeAttendanceToday(actor, today),
      this.computeFunnel(actor),
      this.performance.leaderboard(actor, { limit: 5 }).then((rows) =>
        rows.slice(0, 5),
      ),
      this.computeTeamPerformance(actor),
      this.computeExceptions(actor, today, todayEnd),
      actor.role === Role.team_leader
        ? this.computePendingReview(actor)
        : Promise.resolve(undefined),
    ]);

    return {
      kpis,
      attendance_today: attendanceToday,
      funnel,
      top_performers: topPerformers,
      team_performance: teamPerformance,
      exceptions,
      ...(pendingReview ? { pending_review: pendingReview } : {}),
    };
  }

  private async computeKpis(actor: AuthenticatedUser) {
    const userScope = userScopeWhere(actor);
    const teamScope = teamScopeWhere(actor);
    const projectScope = projectScopeWhere(actor);
    const leadScope = leadScopeWhere(actor);
    const ticketScope = ticketScopeWhere(actor);

    const [total_interns, active_teams, active_projects, leads_generated, leads_converted, open_tickets] =
      await Promise.all([
        this.prisma.user.count({
          where: { AND: [userScope, { role: Role.intern, status: 'active' }] },
        }),
        this.prisma.team.count({ where: { AND: [teamScope, { is_active: true }] } }),
        this.prisma.project.count({
          where: { AND: [projectScope, { status: { in: ['planning', 'in_progress'] } }] },
        }),
        this.prisma.lead.count({ where: leadScope }),
        this.prisma.lead.count({
          where: { AND: [leadScope, { status: LeadStatus.converted }] },
        }),
        this.prisma.ticket.count({
          where: { AND: [ticketScope, { status: { in: ['open', 'in_progress'] } }] },
        }),
      ]);

    return {
      total_interns,
      active_teams,
      active_projects,
      leads_generated,
      leads_converted,
      open_tickets,
    };
  }

  private async computeAttendanceToday(actor: AuthenticatedUser, today: Date) {
    const userWhere: Prisma.UserWhereInput = {
      AND: [userScopeWhere(actor), { status: 'active' }],
    };
    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where: userWhere }),
      this.prisma.attendance.findMany({
        where: { AND: [attendanceScopeWhere(actor), { date: today }] },
        select: { status: true },
      }),
    ]);
    const counts = { present: 0, late: 0, half_day: 0, leave: 0, absent: 0 };
    for (const r of rows) counts[r.status] += 1;
    const marked = rows.length;
    return {
      ...counts,
      no_mark: Math.max(0, total - marked),
      total,
    };
  }

  private async computeFunnel(actor: AuthenticatedUser) {
    const grouped = await this.prisma.lead.groupBy({
      by: ['status'],
      where: leadScopeWhere(actor),
      _count: { _all: true },
    });
    const out: Record<LeadStatus, number> = {
      new: 0,
      contacted: 0,
      interested: 0,
      follow_up: 0,
      converted: 0,
      lost: 0,
      invalid: 0,
    };
    for (const r of grouped) out[r.status] = r._count._all;
    return out;
  }

  private async computeTeamPerformance(actor: AuthenticatedUser) {
    const teams = await this.prisma.team.findMany({
      where: { AND: [teamScopeWhere(actor), { is_active: true }] },
      select: {
        id: true,
        name: true,
        members: {
          select: {
            user: {
              select: {
                id: true,
                status: true,
                performance_scores: {
                  orderBy: { period_end: 'desc' },
                  take: 1,
                  select: { total_score: true },
                },
              },
            },
          },
        },
      },
      take: 20,
    });

    return teams
      .map((t) => {
        const activeMembers = t.members.filter((m) => m.user.status === 'active');
        const scored = activeMembers
          .map((m) => m.user.performance_scores[0]?.total_score)
          .filter((s): s is Prisma.Decimal => !!s);
        const avg =
          scored.length === 0
            ? 0
            : Math.round(
                scored.reduce((sum, s) => sum + Number(s), 0) / scored.length,
              );
        return {
          team_id: t.id,
          team_name: t.name,
          avg_score: avg,
          member_count: activeMembers.length,
        };
      })
      .sort((a, b) => b.avg_score - a.avg_score);
  }

  private async computeExceptions(
    actor: AuthenticatedUser,
    today: Date,
    todayEnd: Date,
  ) {
    const config = await this.prisma.scoringConfig.findUnique({
      where: { is_active: true },
    });
    const staleDays = config?.stale_lead_days ?? 3;
    const staleCutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);

    // Missing reports today: only relevant on a working day.
    const reportEligibleUsers = isWorkingDay(today)
      ? await this.prisma.user.findMany({
          where: {
            AND: [
              userScopeWhere(actor),
              { status: 'active' },
              { role: { in: ['intern', 'team_leader'] } },
              {
                OR: [
                  { joining_date: null },
                  { joining_date: { lte: today } },
                ],
              },
              {
                daily_reports: {
                  none: { report_date: today },
                },
              },
            ],
          },
          select: { id: true, full_name: true },
          orderBy: { full_name: 'asc' },
          take: 100,
        })
      : [];

    const [staleLeads, overdueTasks, unattendedOpenTickets, staleLeadPreview, overduePreview, unattendedPreview] =
      await Promise.all([
        this.prisma.lead.count({
          where: {
            AND: [
              leadScopeWhere(actor),
              { status: { notIn: ['converted', 'lost', 'invalid'] } },
              {
                OR: [
                  { last_activity_at: { lt: staleCutoff } },
                  { last_activity_at: null, created_at: { lt: staleCutoff } },
                ],
              },
            ],
          },
        }),
        this.prisma.task.count({
          where: {
            AND: [
              taskScopeWhere(actor),
              { due_date: { lt: todayEnd } },
              { status: { notIn: ['completed'] } },
            ],
          },
        }),
        // For unattended tickets we want a count, but per-priority SLA thresholds
        // are computed in code. Fetch the open/in_progress ones and post-filter.
        this.prisma.ticket.findMany({
          where: {
            AND: [
              ticketScopeWhere(actor),
              { status: { in: ['open', 'in_progress'] } },
            ],
          },
          select: {
            id: true,
            title: true,
            priority: true,
            created_at: true,
          },
        }),
        this.prisma.lead.findMany({
          where: {
            AND: [
              leadScopeWhere(actor),
              { status: { notIn: ['converted', 'lost', 'invalid'] } },
              {
                OR: [
                  { last_activity_at: { lt: staleCutoff } },
                  { last_activity_at: null, created_at: { lt: staleCutoff } },
                ],
              },
            ],
          },
          select: { id: true, name: true },
          orderBy: [{ last_activity_at: 'asc' }],
          take: 5,
        }),
        this.prisma.task.findMany({
          where: {
            AND: [
              taskScopeWhere(actor),
              { due_date: { lt: todayEnd } },
              { status: { notIn: ['completed'] } },
            ],
          },
          select: {
            id: true,
            title: true,
            assignee: { select: { full_name: true } },
          },
          orderBy: [{ due_date: 'asc' }],
          take: 5,
        }),
        this.prisma.ticket.findMany({
          where: {
            AND: [
              ticketScopeWhere(actor),
              { status: { in: ['open', 'in_progress'] } },
            ],
          },
          select: { id: true, title: true, priority: true, created_at: true },
          orderBy: [{ created_at: 'asc' }],
          take: 10,
        }),
      ]);

    const SLA_HOURS_BY_PRIORITY = { urgent: 4, high: 12, medium: 24, low: 72 };
    const now = Date.now();
    const unattendedPredicate = (t: { priority: string; created_at: Date }) =>
      now - t.created_at.getTime() >
      (SLA_HOURS_BY_PRIORITY[t.priority as keyof typeof SLA_HOURS_BY_PRIORITY] ?? 24) *
        60 *
        60 *
        1000;
    const unattendedCount = unattendedOpenTickets.filter(unattendedPredicate).length;
    const unattendedPreviewFiltered = unattendedPreview
      .filter(unattendedPredicate)
      .slice(0, 5)
      .map((t) => ({ id: t.id, title: t.title, priority: t.priority }));

    return {
      missing_reports_today: reportEligibleUsers.length,
      stale_leads: staleLeads,
      overdue_tasks: overdueTasks,
      unattended_tickets: unattendedCount,
      preview: {
        missing_reports_users: reportEligibleUsers.slice(0, 5).map((u) => ({
          user_id: u.id,
          full_name: u.full_name,
        })),
        stale_lead_titles: staleLeadPreview.map((l) => ({ id: l.id, name: l.name })),
        overdue_task_titles: overduePreview.map((t) => ({
          id: t.id,
          title: t.title,
          assignee: t.assignee?.full_name ?? null,
        })),
        unattended_ticket_titles: unattendedPreviewFiltered,
      },
    };
  }

  private async computePendingReview(actor: AuthenticatedUser) {
    const [reports, tasks] = await Promise.all([
      this.prisma.dailyReport.count({
        where: {
          reviewed_at: null,
          author: {
            memberships: { some: { team_id: { in: actor.led_team_ids } } },
          },
        },
      }),
      this.prisma.task.count({
        where: {
          status: 'in_review',
          OR: [
            { project: { team_id: { in: actor.led_team_ids } } },
            { lead: { team_id: { in: actor.led_team_ids } } },
            { created_by: actor.id },
          ],
        },
      }),
    ]);
    return { daily_reports: reports, tasks };
  }

  // ───────────────────────── intern ──────────────────────────────────────────

  private async internDashboard(actor: AuthenticatedUser) {
    const today = startOfDay(new Date());
    const todayEnd = endOfDay(today);
    const inFiveDays = new Date(today);
    inFiveDays.setDate(inFiveDays.getDate() + 5);

    const [score, todayTasks, followups, todayReport, attendanceRow, openTickets] = await Promise.all([
      this.performance
        .getScore(actor, actor.id, {})
        .catch(() => null),
      this.prisma.task.findMany({
        where: {
          assignee_id: actor.id,
          status: { notIn: ['completed'] },
          OR: [
            { due_date: { lte: todayEnd } },
            { status: 'in_progress' },
          ],
        },
        orderBy: [
          { priority: 'desc' },
          { due_date: { sort: 'asc', nulls: 'last' } },
        ],
        take: 10,
        select: TASK_DASHBOARD_SELECT,
      }),
      this.prisma.lead.findMany({
        where: {
          assigned_to: actor.id,
          status: { notIn: ['converted', 'lost', 'invalid'] },
          OR: [
            { next_follow_up: { lte: inFiveDays } },
            { last_activity_at: { lt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) } },
          ],
        },
        orderBy: [{ next_follow_up: { sort: 'asc', nulls: 'last' } }],
        take: 10,
        select: LEAD_DASHBOARD_SELECT,
      }),
      this.prisma.dailyReport.findUnique({
        where: { user_id_report_date: { user_id: actor.id, report_date: today } },
        select: DAILY_REPORT_SELECT,
      }),
      this.prisma.attendance.findUnique({
        where: { user_id_date: { user_id: actor.id, date: today } },
        select: { status: true, check_in: true, check_out: true },
      }),
      this.prisma.ticket.findMany({
        where: {
          raised_by: actor.id,
          status: { in: ['open', 'in_progress'] },
        },
        orderBy: [{ created_at: 'desc' }],
        take: 10,
        select: TICKET_DASHBOARD_SELECT,
      }),
    ]);

    return {
      my_score: score,
      my_band: score && 'band' in score ? score.band : null,
      today_tasks: todayTasks.map(decorateTask),
      upcoming_followups: followups.map(decorateLead),
      today_report: todayReport,
      my_attendance_today: {
        status: attendanceRow?.status ?? null,
        check_in: attendanceRow?.check_in?.toISOString() ?? null,
        check_out: attendanceRow?.check_out?.toISOString() ?? null,
      },
      my_open_tickets: openTickets.map(decorateTicket),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Selects + decorators for the intern dashboard rows. Keep selects narrow so
// the dashboard payload stays small and fast.
// ─────────────────────────────────────────────────────────────────────────────

const TASK_DASHBOARD_SELECT = {
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

const LEAD_DASHBOARD_SELECT = {
  id: true,
  name: true,
  phone: true,
  email: true,
  source: true,
  service_interest: true,
  location: true,
  notes: true,
  estimated_value: true,
  status: true,
  assigned_to: true,
  team_id: true,
  next_follow_up: true,
  deal_value: true,
  converted_at: true,
  last_activity_at: true,
  created_at: true,
  updated_at: true,
  assignee: { select: { id: true, full_name: true } },
  team: { select: { id: true, name: true } },
} satisfies Prisma.LeadSelect;

const DAILY_REPORT_SELECT = {
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

const TICKET_DASHBOARD_SELECT = {
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

type TaskRow = Prisma.TaskGetPayload<{ select: typeof TASK_DASHBOARD_SELECT }>;
type LeadRow = Prisma.LeadGetPayload<{ select: typeof LEAD_DASHBOARD_SELECT }>;
type TicketRow = Prisma.TicketGetPayload<{ select: typeof TICKET_DASHBOARD_SELECT }>;

function decorateTask(t: TaskRow) {
  const isOverdue =
    t.due_date !== null && t.status !== 'completed' && t.due_date.getTime() < Date.now();
  return { ...t, is_overdue: isOverdue };
}

function decorateLead(l: LeadRow) {
  return l;
}

const SLA_HOURS_BY_PRIORITY: Record<string, number> = {
  urgent: 4,
  high: 12,
  medium: 24,
  low: 72,
};

function decorateTicket(t: TicketRow) {
  const ref = t.closed_at ?? new Date();
  const age = (ref.getTime() - t.created_at.getTime()) / (1000 * 60 * 60);
  const threshold = SLA_HOURS_BY_PRIORITY[t.priority] ?? 24;
  return {
    ...t,
    age_hours: Math.round(age * 10) / 10,
    is_unattended:
      (t.status === 'open' || t.status === 'in_progress') && age > threshold,
    message_count: t._count.messages,
  };
}

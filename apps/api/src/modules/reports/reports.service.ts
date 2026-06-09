import { ForbiddenException, Injectable } from '@nestjs/common';
import { LeadStatus, Prisma, Role } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import {
  leadScopeWhere,
  projectScopeWhere,
  teamScopeWhere,
  userScopeWhere,
} from '../../common/utils/scope';
import {
  endOfDay,
  startOfDay,
  workingDaysBetween,
} from '../../common/utils/working-days';
import { PrismaService } from '../../prisma/prisma.service';
import { PerformanceService } from '../performance/performance.service';

const APPROACHING_DAYS = 7;

interface PeriodArgs {
  from?: string;
  to?: string;
  team_id?: string;
}

interface ResolvedPeriod {
  from: Date;
  to: Date;
  team_id: string | null;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly performance: PerformanceService,
  ) {}

  // ───────────────────────── 1. Team performance ─────────────────────────────

  async teamPerformance(actor: AuthenticatedUser, args: PeriodArgs) {
    this.assertStaff(actor);
    const period = this.resolvePeriod(args);

    const teams = await this.prisma.team.findMany({
      where: {
        AND: [
          teamScopeWhere(actor),
          { is_active: true },
          period.team_id ? { id: period.team_id } : {},
        ],
      },
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
      orderBy: { name: 'asc' },
    });

    const rows = await Promise.all(
      teams.map(async (t) => {
        const activeMembers = t.members.filter((m) => m.user.status === 'active');
        const memberIds = activeMembers.map((m) => m.user.id);
        const scored = activeMembers
          .map((m) => m.user.performance_scores[0]?.total_score)
          .filter((v): v is Prisma.Decimal => !!v);
        const avgScore =
          scored.length === 0
            ? 0
            : Math.round(scored.reduce((s, v) => s + Number(v), 0) / scored.length);

        const [generated, converted, tasksCompleted, attendanceRows] = await Promise.all([
          this.prisma.lead.count({
            where: {
              team_id: t.id,
              created_at: { gte: period.from, lte: period.to },
            },
          }),
          this.prisma.lead.count({
            where: {
              team_id: t.id,
              status: LeadStatus.converted,
              converted_at: { gte: period.from, lte: period.to },
            },
          }),
          this.prisma.task.count({
            where: {
              status: 'completed',
              completed_at: { gte: period.from, lte: period.to },
              assignee_id: memberIds.length ? { in: memberIds } : undefined,
            },
          }),
          this.prisma.attendance.findMany({
            where: {
              user_id: { in: memberIds.length ? memberIds : ['__none__'] },
              date: { gte: period.from, lte: period.to },
            },
            select: { status: true, user_id: true },
          }),
        ]);

        const conversionRate =
          generated > 0 ? Math.round((converted / generated) * 100) : 0;

        const workingDays = workingDaysBetween(period.from, period.to).length;
        const perUser = new Map<string, { present: number; late: number; half: number }>();
        for (const id of memberIds) perUser.set(id, { present: 0, late: 0, half: 0 });
        for (const r of attendanceRows) {
          const slot = perUser.get(r.user_id);
          if (!slot) continue;
          if (r.status === 'present') slot.present += 1;
          else if (r.status === 'late') slot.late += 1;
          else if (r.status === 'half_day') slot.half += 1;
        }
        const userPcts: number[] = [];
        for (const id of memberIds) {
          const s = perUser.get(id)!;
          const present_eq = s.present + s.late + 0.5 * s.half;
          userPcts.push(workingDays > 0 ? (present_eq / workingDays) * 100 : 0);
        }
        const attendanceAvg =
          userPcts.length === 0
            ? 0
            : Math.round(userPcts.reduce((s, v) => s + v, 0) / userPcts.length);

        return {
          team_id: t.id,
          team_name: t.name,
          member_count: activeMembers.length,
          avg_score: avgScore,
          leads_generated: generated,
          leads_converted: converted,
          conversion_rate_pct: conversionRate,
          tasks_completed: tasksCompleted,
          attendance_avg_pct: attendanceAvg,
        };
      }),
    );

    return { data: rows, meta: this.meta(period) };
  }

  // ───────────────────────── 2. Lead performance ─────────────────────────────

  async leadPerformance(actor: AuthenticatedUser, args: PeriodArgs) {
    this.assertStaff(actor);
    const period = this.resolvePeriod(args);

    const users = await this.prisma.user.findMany({
      where: {
        AND: [
          userScopeWhere(actor),
          { status: 'active' },
          { role: { in: ['intern', 'team_leader'] } },
          period.team_id
            ? { memberships: { some: { team_id: period.team_id } } }
            : {},
        ],
      },
      select: {
        id: true,
        full_name: true,
        memberships: { select: { team: { select: { name: true } } } },
      },
      orderBy: { full_name: 'asc' },
    });

    const rows = await Promise.all(
      users.map(async (u) => {
        const [assigned, worked, convertedLeads] = await Promise.all([
          this.prisma.lead.count({
            where: { assigned_to: u.id, created_at: { lte: period.to } },
          }),
          this.prisma.lead.count({
            where: {
              assigned_to: u.id,
              last_activity_at: { gte: period.from, lte: period.to },
            },
          }),
          this.prisma.lead.findMany({
            where: {
              assigned_to: u.id,
              status: LeadStatus.converted,
              converted_at: { gte: period.from, lte: period.to },
            },
            select: { deal_value: true },
          }),
        ]);

        const converted = convertedLeads.length;
        const conversionRate =
          worked > 0 ? Math.round((converted / worked) * 100) : 0;
        const totalValue = convertedLeads.reduce(
          (sum, l) => sum + (l.deal_value ? Number(l.deal_value) : 0),
          0,
        );

        return {
          user_id: u.id,
          full_name: u.full_name,
          team_names: u.memberships.map((m) => m.team.name),
          leads_assigned: assigned,
          leads_worked: worked,
          leads_converted: converted,
          conversion_rate_pct: conversionRate,
          total_deal_value: Math.round(totalValue),
        };
      }),
    );

    rows.sort((a, b) => b.leads_converted - a.leads_converted);
    return { data: rows, meta: this.meta(period) };
  }

  // ───────────────────────── 3. Attendance ───────────────────────────────────

  async attendance(actor: AuthenticatedUser, args: PeriodArgs) {
    this.assertStaff(actor);
    const period = this.resolvePeriod(args);

    const userWhere: Prisma.UserWhereInput = {
      AND: [
        userScopeWhere(actor),
        { status: 'active' },
        { role: { in: ['intern', 'team_leader'] } },
        period.team_id
          ? { memberships: { some: { team_id: period.team_id } } }
          : {},
      ],
    };
    const users = await this.prisma.user.findMany({
      where: userWhere,
      select: {
        id: true,
        full_name: true,
        attendance_records: {
          where: { date: { gte: period.from, lte: period.to } },
          select: { status: true },
        },
      },
      orderBy: { full_name: 'asc' },
    });
    const workingDays = workingDaysBetween(period.from, period.to).length;

    const rows = users.map((u) => {
      const counts = { present: 0, absent: 0, leave: 0, half_day: 0, late: 0 };
      for (const r of u.attendance_records) counts[r.status] += 1;
      const presentEq = counts.present + counts.late + 0.5 * counts.half_day;
      const pct =
        workingDays > 0 ? Math.round((presentEq / workingDays) * 100) : 0;
      return {
        user_id: u.id,
        full_name: u.full_name,
        working_days: workingDays,
        ...counts,
        attendance_pct: pct,
      };
    });

    return { data: rows, meta: this.meta(period) };
  }

  // ───────────────────────── 4. Project progress ─────────────────────────────

  async projectProgress(actor: AuthenticatedUser, args: PeriodArgs) {
    this.assertStaff(actor);
    const period = this.resolvePeriod(args);

    const projects = await this.prisma.project.findMany({
      where: {
        AND: [
          projectScopeWhere(actor),
          period.team_id ? { team_id: period.team_id } : {},
        ],
      },
      select: {
        id: true,
        name: true,
        client_name: true,
        status: true,
        progress_pct: true,
        deadline: true,
        team: { select: { name: true } },
        deliverables: { select: { is_done: true } },
        tasks: { select: { status: true } },
      },
      orderBy: [{ status: 'asc' }, { deadline: { sort: 'asc', nulls: 'last' } }],
    });

    const rows = projects.map((p) => {
      const dTotal = p.deliverables.length;
      const dDone = p.deliverables.filter((d) => d.is_done).length;
      const tTotal = p.tasks.length;
      const tDone = p.tasks.filter((t) => t.status === 'completed').length;
      let derived = 0;
      if (dTotal === 0 && tTotal === 0) derived = 0;
      else if (dTotal === 0) derived = Math.round((tDone / tTotal) * 100);
      else if (tTotal === 0) derived = Math.round((dDone / dTotal) * 100);
      else derived = Math.round(((dDone / dTotal) * 50) + ((tDone / tTotal) * 50));

      let deadlineRisk: 'none' | 'approaching' | 'overdue' = 'none';
      if (p.deadline && p.status !== 'completed' && p.status !== 'cancelled') {
        const now = Date.now();
        if (p.deadline.getTime() < now) deadlineRisk = 'overdue';
        else if (p.deadline.getTime() - now < APPROACHING_DAYS * 24 * 60 * 60 * 1000) {
          deadlineRisk = 'approaching';
        }
      }

      return {
        project_id: p.id,
        project_name: p.name,
        team_name: p.team?.name ?? null,
        client_name: p.client_name,
        status: p.status,
        progress_pct: p.progress_pct,
        derived_progress_pct: derived,
        deliverables_done: dDone,
        deliverables_total: dTotal,
        tasks_completed: tDone,
        tasks_total: tTotal,
        deadline: p.deadline ? p.deadline.toISOString().slice(0, 10) : null,
        deadline_risk: deadlineRisk,
      };
    });

    return { data: rows, meta: this.meta(period) };
  }

  // ───────────────────────── 5. Intern rankings ──────────────────────────────

  async internRankings(actor: AuthenticatedUser, args: PeriodArgs) {
    this.assertStaff(actor);
    const period = this.resolvePeriod(args);

    const leaderboard = await this.performance.leaderboard(actor, {
      team_id: period.team_id ?? undefined,
      limit: 100,
    });

    const userIds = leaderboard.map((row) => row.user_id);
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            memberships: { select: { team: { select: { name: true } } } },
            performance_scores: {
              orderBy: { period_end: 'desc' },
              take: 1,
              select: {
                attendance_score: true,
                task_score: true,
                lead_score: true,
                project_score: true,
                feedback_score: true,
                discipline_score: true,
              },
            },
          },
        })
      : [];
    const byUser = new Map(users.map((u) => [u.id, u]));

    const rows = leaderboard.map((row) => {
      const u = byUser.get(row.user_id);
      const ps = u?.performance_scores[0];
      return {
        rank: row.rank,
        user_id: row.user_id,
        full_name: row.full_name,
        team_names: u?.memberships.map((m) => m.team.name) ?? [],
        total_score: row.total_score,
        band: row.band,
        attendance_score: ps ? Number(ps.attendance_score) : 0,
        task_score: ps ? Number(ps.task_score) : 0,
        lead_score: ps ? Number(ps.lead_score) : 0,
        project_score: ps ? Number(ps.project_score) : 0,
        feedback_score: ps ? Number(ps.feedback_score) : 0,
        discipline_score: ps ? Number(ps.discipline_score) : 0,
      };
    });

    return { data: rows, meta: this.meta(period) };
  }

  // ───────────────────────── 6. Conversion ───────────────────────────────────

  async conversion(actor: AuthenticatedUser, args: PeriodArgs) {
    this.assertStaff(actor);
    const period = this.resolvePeriod(args);

    const where: Prisma.LeadWhereInput = {
      AND: [
        leadScopeWhere(actor),
        period.team_id ? { team_id: period.team_id } : {},
      ],
    };

    const [grouped, convertedLeads, sourcesGroup] = await Promise.all([
      this.prisma.lead.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      this.prisma.lead.findMany({
        where: {
          AND: [
            where,
            { status: LeadStatus.converted },
            { converted_at: { gte: period.from, lte: period.to } },
          ],
        },
        select: { source: true, deal_value: true },
      }),
      this.prisma.lead.findMany({
        where: {
          AND: [
            where,
            {
              OR: [
                { last_activity_at: { gte: period.from, lte: period.to } },
                {
                  status: LeadStatus.converted,
                  converted_at: { gte: period.from, lte: period.to },
                },
              ],
            },
          ],
        },
        select: { source: true, status: true, deal_value: true },
      }),
    ]);

    const funnel: Record<LeadStatus, number> = {
      new: 0,
      contacted: 0,
      interested: 0,
      follow_up: 0,
      converted: 0,
      lost: 0,
      invalid: 0,
    };
    for (const r of grouped) funnel[r.status] = r._count._all;

    const totalValue = convertedLeads.reduce(
      (s, l) => s + (l.deal_value ? Number(l.deal_value) : 0),
      0,
    );
    const avgValue =
      convertedLeads.length > 0 ? Math.round(totalValue / convertedLeads.length) : 0;

    // Per-source breakdown
    const bySource = new Map<
      string,
      { worked: number; converted: number; total_value: number }
    >();
    for (const r of sourcesGroup) {
      const key = r.source?.trim() || 'Unknown';
      const slot = bySource.get(key) ?? { worked: 0, converted: 0, total_value: 0 };
      slot.worked += 1;
      if (r.status === LeadStatus.converted) {
        slot.converted += 1;
        slot.total_value += r.deal_value ? Number(r.deal_value) : 0;
      }
      bySource.set(key, slot);
    }
    const sourceRows = [...bySource.entries()]
      .map(([source, v]) => ({
        source,
        worked: v.worked,
        converted: v.converted,
        conversion_rate_pct:
          v.worked > 0 ? Math.round((v.converted / v.worked) * 100) : 0,
        total_value: Math.round(v.total_value),
      }))
      .sort((a, b) => b.converted - a.converted);

    return {
      data: [
        {
          funnel,
          total_deal_value: Math.round(totalValue),
          avg_deal_value: avgValue,
          by_source: sourceRows,
        },
      ],
      meta: this.meta(period),
    };
  }

  // ───────────────────────── internals ───────────────────────────────────────

  private resolvePeriod(args: PeriodArgs): ResolvedPeriod {
    const today = startOfDay(new Date());
    const to = args.to ? endOfDay(new Date(args.to)) : endOfDay(today);
    const fromDefault = new Date(today);
    fromDefault.setDate(today.getDate() - 29);
    const from = args.from ? startOfDay(new Date(args.from)) : startOfDay(fromDefault);
    return { from, to, team_id: args.team_id ?? null };
  }

  private meta(period: ResolvedPeriod) {
    return {
      from: period.from.toISOString().slice(0, 10),
      to: period.to.toISOString().slice(0, 10),
      generated_at: new Date().toISOString(),
      team_id: period.team_id,
    };
  }

  private assertStaff(actor: AuthenticatedUser): void {
    if (actor.role === Role.intern) {
      throw new ForbiddenException('Reports are scoped to leaders and admins');
    }
  }
}

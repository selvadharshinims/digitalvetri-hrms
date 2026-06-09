/**
 * Query tools exposed to Claude in the conversational-query loop.
 *
 * Tools are constructed per-request because each one captures the caller's
 * `AuthenticatedUser` in a closure to apply scope filters (admin sees all,
 * leader sees their teams, etc.). Returning a fresh set per request also
 * lets us trace which tools each user invoked.
 *
 * Each tool returns plain JSON the model can read; we trim to the minimum
 * useful fields so the model has signal without paying for context bloat.
 */
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { LeadStatus, Prisma, TaskStatus } from '@prisma/client';
import * as z from 'zod/v4';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import {
  leadScopeWhere,
  projectScopeWhere,
  taskScopeWhere,
  teamScopeWhere,
  userScopeWhere,
} from '../../common/utils/scope';
import type { PrismaService } from '../../prisma/prisma.service';

export interface ToolDeps {
  prisma: PrismaService;
  actor: AuthenticatedUser;
}

/**
 * Each tool call is captured here for observability + UI display. The chat
 * UI shows a collapsed "Sources" panel listing which tools the model used.
 */
export interface ToolCallTrace {
  name: string;
  input: unknown;
  result_summary: string;
}

const LEAD_STATUS_ENUM = z.enum([
  'new',
  'contacted',
  'interested',
  'follow_up',
  'converted',
  'lost',
  'invalid',
]);
const TASK_STATUS_ENUM = z.enum([
  'todo',
  'in_progress',
  'in_review',
  'completed',
  'blocked',
]);
const ROLE_ENUM = z.enum(['super_admin', 'team_leader', 'intern']);
const USER_STATUS_ENUM = z.enum(['active', 'inactive', 'completed']);
const PROJECT_STATUS_ENUM = z.enum([
  'planning',
  'in_progress',
  'on_hold',
  'completed',
  'cancelled',
]);
const RISK_BAND_ENUM = z.enum(['on_track', 'at_risk', 'off_track', 'stalled']);
const SCORE_BAND_ENUM = z.enum(['hot', 'warm', 'cold', 'invalid']);

export function buildQueryTools(deps: ToolDeps, trace: ToolCallTrace[]) {
  const { prisma, actor } = deps;

  const findUsers = betaZodTool({
    name: 'find_users',
    description:
      'Find users (interns + leaders) matching filters. Use this to answer questions like "who is at risk", "who has low scores", "who hasn\'t submitted reports". Returns up to `limit` users (default 20).',
    inputSchema: z.object({
      role: ROLE_ENUM.optional(),
      status: USER_STATUS_ENUM.optional().default('active'),
      team_id: z.string().uuid().optional(),
      score_lt: z.number().int().min(0).max(100).optional().describe(
        'Return users whose latest performance score is less than this value.',
      ),
      score_gt: z.number().int().min(0).max(100).optional(),
      limit: z.number().int().min(1).max(50).optional().default(20),
    }),
    run: async (input) => {
      const where: Prisma.UserWhereInput = {
        AND: [
          userScopeWhere(actor),
          { status: input.status },
          input.role ? { role: input.role } : {},
          input.team_id ? { memberships: { some: { team_id: input.team_id } } } : {},
        ],
      };
      const users = await prisma.user.findMany({
        where,
        select: {
          id: true,
          full_name: true,
          email: true,
          role: true,
          memberships: { select: { team: { select: { name: true } } } },
          performance_scores: {
            orderBy: { period_end: 'desc' },
            take: 1,
            select: { total_score: true },
          },
        },
        orderBy: { full_name: 'asc' },
        take: input.limit,
      });
      const rows = users
        .map((u) => ({
          id: u.id,
          full_name: u.full_name,
          email: u.email,
          role: u.role,
          team_names: u.memberships.map((m) => m.team.name),
          score: u.performance_scores[0]
            ? Math.round(Number(u.performance_scores[0].total_score))
            : null,
        }))
        .filter((u) => {
          if (input.score_lt !== undefined && (u.score === null || u.score >= input.score_lt)) {
            return false;
          }
          if (input.score_gt !== undefined && (u.score === null || u.score <= input.score_gt)) {
            return false;
          }
          return true;
        });
      trace.push({
        name: 'find_users',
        input,
        result_summary: `${rows.length} user(s)`,
      });
      return JSON.stringify({ users: rows });
    },
  });

  const searchUsersByName = betaZodTool({
    name: 'search_users_by_name',
    description:
      'Resolve a partial name (first name, last name, or substring) to user records. Use this first when the question mentions a person by name; pass the returned `id` to other tools.',
    inputSchema: z.object({
      query: z.string().min(1).describe('Substring of the user\'s name.'),
      limit: z.number().int().min(1).max(10).optional().default(5),
    }),
    run: async (input) => {
      const users = await prisma.user.findMany({
        where: {
          AND: [
            userScopeWhere(actor),
            { full_name: { contains: input.query, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          full_name: true,
          role: true,
          memberships: { select: { team: { select: { name: true } } } },
        },
        take: input.limit,
      });
      const rows = users.map((u) => ({
        id: u.id,
        full_name: u.full_name,
        role: u.role,
        team_names: u.memberships.map((m) => m.team.name),
      }));
      trace.push({
        name: 'search_users_by_name',
        input,
        result_summary: `${rows.length} match(es) for "${input.query}"`,
      });
      return JSON.stringify({ users: rows });
    },
  });

  const findLeads = betaZodTool({
    name: 'find_leads',
    description:
      'Find leads matching filters. Use for questions about pipeline state, stale leads, hot leads, conversions, leads by source. Returns up to `limit` results (default 20).',
    inputSchema: z.object({
      status: LEAD_STATUS_ENUM.optional(),
      source: z.string().optional(),
      assigned_to: z.string().uuid().optional(),
      team_id: z.string().uuid().optional(),
      days_since_activity_gt: z.number().int().min(0).optional().describe(
        'Return leads with no activity in more than N days (for staleness queries).',
      ),
      ai_score_band: SCORE_BAND_ENUM.optional(),
      converted_in_last_days: z.number().int().min(1).max(180).optional().describe(
        'Return only leads converted in the last N days.',
      ),
      limit: z.number().int().min(1).max(50).optional().default(20),
    }),
    run: async (input) => {
      const now = Date.now();
      const where: Prisma.LeadWhereInput = {
        AND: [
          leadScopeWhere(actor),
          input.status ? { status: input.status } : {},
          input.source ? { source: { equals: input.source, mode: 'insensitive' } } : {},
          input.assigned_to ? { assigned_to: input.assigned_to } : {},
          input.team_id ? { team_id: input.team_id } : {},
          input.ai_score_band ? { ai_score_band: input.ai_score_band } : {},
          input.days_since_activity_gt !== undefined
            ? {
                OR: [
                  {
                    last_activity_at: {
                      lt: new Date(now - input.days_since_activity_gt * 24 * 60 * 60 * 1000),
                    },
                  },
                  {
                    last_activity_at: null,
                    created_at: {
                      lt: new Date(now - input.days_since_activity_gt * 24 * 60 * 60 * 1000),
                    },
                  },
                ],
              }
            : {},
          input.converted_in_last_days !== undefined
            ? {
                status: LeadStatus.converted,
                converted_at: {
                  gte: new Date(now - input.converted_in_last_days * 24 * 60 * 60 * 1000),
                },
              }
            : {},
        ],
      };
      const leads = await prisma.lead.findMany({
        where,
        select: {
          id: true,
          name: true,
          status: true,
          source: true,
          estimated_value: true,
          deal_value: true,
          last_activity_at: true,
          next_follow_up: true,
          ai_score: true,
          ai_score_band: true,
          ai_score_signal: true,
          assignee: { select: { full_name: true } },
          team: { select: { name: true } },
        },
        orderBy: [{ ai_score: 'desc' }, { last_activity_at: 'desc' }],
        take: input.limit,
      });
      const rows = leads.map((l) => ({
        id: l.id,
        name: l.name,
        status: l.status,
        source: l.source,
        estimated_value: l.estimated_value ? Number(l.estimated_value) : null,
        deal_value: l.deal_value ? Number(l.deal_value) : null,
        last_activity_days_ago: l.last_activity_at
          ? Math.floor((now - l.last_activity_at.getTime()) / (1000 * 60 * 60 * 24))
          : null,
        next_follow_up: l.next_follow_up?.toISOString().slice(0, 10) ?? null,
        ai_score: l.ai_score,
        ai_score_band: l.ai_score_band,
        ai_score_signal: l.ai_score_signal,
        assignee_name: l.assignee?.full_name ?? null,
        team_name: l.team?.name ?? null,
      }));
      trace.push({
        name: 'find_leads',
        input,
        result_summary: `${rows.length} lead(s)`,
      });
      return JSON.stringify({ leads: rows });
    },
  });

  const findTasks = betaZodTool({
    name: 'find_tasks',
    description:
      'Find tasks matching filters. Use for questions about overdue work, blocked tasks, what someone is working on, project task lists. Returns up to `limit` results (default 20).',
    inputSchema: z.object({
      status: TASK_STATUS_ENUM.optional(),
      assignee_id: z.string().uuid().optional(),
      project_id: z.string().uuid().optional(),
      team_id: z.string().uuid().optional().describe('Tasks where the project belongs to this team.'),
      overdue: z.boolean().optional().describe('Tasks past their due date and not completed.'),
      blocked: z.boolean().optional(),
      limit: z.number().int().min(1).max(50).optional().default(20),
    }),
    run: async (input) => {
      const now = new Date();
      const where: Prisma.TaskWhereInput = {
        AND: [
          taskScopeWhere(actor),
          input.status ? { status: input.status } : {},
          input.assignee_id ? { assignee_id: input.assignee_id } : {},
          input.project_id ? { project_id: input.project_id } : {},
          input.team_id ? { project: { team_id: input.team_id } } : {},
          input.overdue
            ? {
                due_date: { lt: now },
                status: { notIn: [TaskStatus.completed] },
              }
            : {},
          input.blocked ? { status: TaskStatus.blocked } : {},
        ],
      };
      const tasks = await prisma.task.findMany({
        where,
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          due_date: true,
          block_reason: true,
          assignee: { select: { full_name: true } },
          project: { select: { name: true } },
        },
        orderBy: [
          { priority: 'desc' },
          { due_date: { sort: 'asc', nulls: 'last' } },
        ],
        take: input.limit,
      });
      const rows = tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        due_date: t.due_date?.toISOString().slice(0, 10) ?? null,
        is_overdue: !!(t.due_date && t.due_date.getTime() < now.getTime() && t.status !== 'completed'),
        block_reason: t.block_reason,
        assignee_name: t.assignee?.full_name ?? null,
        project_name: t.project?.name ?? null,
      }));
      trace.push({
        name: 'find_tasks',
        input,
        result_summary: `${rows.length} task(s)`,
      });
      return JSON.stringify({ tasks: rows });
    },
  });

  const findProjects = betaZodTool({
    name: 'find_projects',
    description:
      'Find projects matching filters. Use for questions about project health, deadlines, risk, what teams are working on. Returns up to `limit` results (default 20).',
    inputSchema: z.object({
      status: PROJECT_STATUS_ENUM.optional(),
      team_id: z.string().uuid().optional(),
      ai_risk_band: RISK_BAND_ENUM.optional(),
      overdue: z.boolean().optional().describe('Projects past deadline and not completed.'),
      limit: z.number().int().min(1).max(50).optional().default(20),
    }),
    run: async (input) => {
      const now = Date.now();
      const where: Prisma.ProjectWhereInput = {
        AND: [
          projectScopeWhere(actor),
          input.status ? { status: input.status } : {},
          input.team_id ? { team_id: input.team_id } : {},
          input.ai_risk_band ? { ai_risk_band: input.ai_risk_band } : {},
          input.overdue
            ? {
                deadline: { lt: new Date(now) },
                status: { notIn: ['completed', 'cancelled'] },
              }
            : {},
        ],
      };
      const projects = await prisma.project.findMany({
        where,
        select: {
          id: true,
          name: true,
          status: true,
          progress_pct: true,
          deadline: true,
          ai_risk_score: true,
          ai_risk_band: true,
          ai_risk_concern: true,
          team: { select: { name: true } },
        },
        orderBy: [{ ai_risk_score: 'desc' }, { deadline: { sort: 'asc', nulls: 'last' } }],
        take: input.limit,
      });
      const rows = projects.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        progress_pct: p.progress_pct,
        deadline: p.deadline?.toISOString().slice(0, 10) ?? null,
        days_until_deadline: p.deadline
          ? Math.floor((p.deadline.getTime() - now) / (1000 * 60 * 60 * 24))
          : null,
        ai_risk_score: p.ai_risk_score,
        ai_risk_band: p.ai_risk_band,
        ai_risk_concern: p.ai_risk_concern,
        team_name: p.team?.name ?? null,
      }));
      trace.push({
        name: 'find_projects',
        input,
        result_summary: `${rows.length} project(s)`,
      });
      return JSON.stringify({ projects: rows });
    },
  });

  const getFunnel = betaZodTool({
    name: 'get_funnel',
    description:
      'Get the lead pipeline funnel counts (per status) for the caller\'s scope or a specific team.',
    inputSchema: z.object({
      team_id: z.string().uuid().optional(),
    }),
    run: async (input) => {
      const where: Prisma.LeadWhereInput = {
        AND: [
          leadScopeWhere(actor),
          input.team_id ? { team_id: input.team_id } : {},
        ],
      };
      const grouped = await prisma.lead.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      });
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
      trace.push({
        name: 'get_funnel',
        input,
        result_summary: `${Object.values(funnel).reduce((s, v) => s + v, 0)} total leads`,
      });
      return JSON.stringify(funnel);
    },
  });

  const getTopPerformers = betaZodTool({
    name: 'get_top_performers',
    description:
      'Get the leaderboard of top interns/leaders by their latest stored performance score, optionally scoped to a team. Only includes users who have a computed score.',
    inputSchema: z.object({
      team_id: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(25).optional().default(5),
    }),
    run: async (input) => {
      const userWhere: Prisma.UserWhereInput = {
        AND: [
          userScopeWhere(actor),
          { status: 'active' },
          { role: { in: ['intern', 'team_leader'] } },
          input.team_id ? { memberships: { some: { team_id: input.team_id } } } : {},
        ],
      };
      const users = await prisma.user.findMany({
        where: userWhere,
        select: {
          id: true,
          full_name: true,
          performance_scores: {
            orderBy: { period_end: 'desc' },
            take: 1,
            select: { total_score: true },
          },
        },
      });
      const ranked = users
        .map((u) => ({
          user_id: u.id,
          full_name: u.full_name,
          total_score: u.performance_scores[0]
            ? Math.round(Number(u.performance_scores[0].total_score))
            : null,
        }))
        .filter((r): r is { user_id: string; full_name: string; total_score: number } =>
          r.total_score !== null,
        )
        .sort((a, b) => b.total_score - a.total_score)
        .slice(0, input.limit)
        .map((r, idx) => ({
          rank: idx + 1,
          ...r,
          band:
            r.total_score >= 85
              ? 'outstanding'
              : r.total_score >= 70
                ? 'strong'
                : r.total_score >= 55
                  ? 'developing'
                  : 'needs_support',
        }));
      trace.push({
        name: 'get_top_performers',
        input,
        result_summary: `${ranked.length} entries`,
      });
      return JSON.stringify({ leaderboard: ranked });
    },
  });

  const getTeamRollup = betaZodTool({
    name: 'get_team_rollup',
    description:
      'High-level rollup for one team: headcount, leader, current task counts by status, lead pipeline numbers, attendance, daily-report submission rate.',
    inputSchema: z.object({
      team_id: z.string().uuid(),
    }),
    run: async (input) => {
      const teamScope = teamScopeWhere(actor);
      const team = await prisma.team.findFirst({
        where: { AND: [teamScope, { id: input.team_id }] },
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
          _count: { select: { projects: true } },
        },
      });
      if (!team) {
        trace.push({
          name: 'get_team_rollup',
          input,
          result_summary: 'team not found or out of scope',
        });
        return JSON.stringify({ error: 'team not found or out of scope' });
      }
      const activeMembers = team.members.filter((m) => m.user.status === 'active');
      const scores = activeMembers
        .map((m) => m.user.performance_scores[0]?.total_score)
        .filter((s): s is Prisma.Decimal => !!s);
      const avgScore =
        scores.length === 0
          ? null
          : Math.round(scores.reduce((s, v) => s + Number(v), 0) / scores.length);

      const memberIds = activeMembers.map((m) => m.user.id);
      const [openTasksCount, blockedCount, leadFunnel] = await Promise.all([
        prisma.task.count({
          where: {
            assignee_id: { in: memberIds.length ? memberIds : [] },
            status: { notIn: ['completed'] },
          },
        }),
        prisma.task.count({
          where: {
            assignee_id: { in: memberIds.length ? memberIds : [] },
            status: 'blocked',
          },
        }),
        prisma.lead.groupBy({
          by: ['status'],
          where: { team_id: team.id },
          _count: { _all: true },
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
      for (const r of leadFunnel) funnel[r.status] = r._count._all;

      trace.push({
        name: 'get_team_rollup',
        input,
        result_summary: `${team.name}: ${activeMembers.length} members, ${openTasksCount} open tasks`,
      });
      return JSON.stringify({
        team_id: team.id,
        team_name: team.name,
        category: team.category,
        leader_name: team.leader?.full_name ?? null,
        active_member_count: activeMembers.length,
        active_projects: team._count.projects,
        open_task_count: openTasksCount,
        blocked_task_count: blockedCount,
        lead_funnel: funnel,
        avg_perf_score: avgScore,
      });
    },
  });

  return [
    findUsers,
    searchUsersByName,
    findLeads,
    findTasks,
    findProjects,
    getFunnel,
    getTopPerformers,
    getTeamRollup,
  ];
}

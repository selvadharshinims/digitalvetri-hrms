import type { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * Returns the Prisma `where` filter that limits a User query to the rows
 * the caller is allowed to see, per PRD §5.2 (RBAC).
 *
 *   super_admin → all users
 *   team_leader → themselves + members of teams they lead
 *   intern      → only themselves
 */
export function userScopeWhere(user: AuthenticatedUser): Prisma.UserWhereInput {
  if (user.role === 'super_admin') return {};
  if (user.role === 'team_leader') {
    return {
      OR: [
        { id: user.id },
        { memberships: { some: { team_id: { in: user.led_team_ids } } } },
      ],
    };
  }
  return { id: user.id };
}

/**
 * Returns the Prisma `where` filter for Team rows the caller can see.
 *   super_admin → all teams
 *   team_leader → teams they lead
 *   intern      → teams they belong to
 */
export function teamScopeWhere(user: AuthenticatedUser): Prisma.TeamWhereInput {
  if (user.role === 'super_admin') return {};
  if (user.role === 'team_leader') {
    return { id: { in: user.led_team_ids } };
  }
  return { id: { in: user.member_team_ids } };
}

export function canManageTeam(user: AuthenticatedUser, teamId: string): boolean {
  if (user.role === 'super_admin') return true;
  if (user.role === 'team_leader') return user.led_team_ids.includes(teamId);
  return false;
}

/**
 * Returns the Prisma `where` filter for Lead rows the caller can see.
 *   super_admin → all leads
 *   team_leader → leads in teams they lead (or assigned to themselves)
 *   intern      → leads assigned to themselves OR in a team they belong to
 *                 (so a freshly-imported team batch is visible before
 *                 anyone is individually assigned)
 */
export function leadScopeWhere(user: AuthenticatedUser): Prisma.LeadWhereInput {
  if (user.role === 'super_admin') return {};
  if (user.role === 'team_leader') {
    return {
      OR: [
        { assigned_to: user.id },
        { team_id: { in: user.led_team_ids } },
      ],
    };
  }
  return {
    OR: [
      { assigned_to: user.id },
      { team_id: { in: user.member_team_ids } },
    ],
  };
}

/**
 * Can the user modify (edit/change status of) a specific lead?
 *   Admin: always.
 *   Team leader: leads they're assigned to OR in a team they lead.
 *   Intern: leads they're assigned to OR in a team they belong to (so a
 *     teammate can pick up a freshly-imported team lead without needing
 *     the leader to assign it first).
 *
 * NB: lead assignment itself is leader-or-admin only — that check lives on
 * the assign endpoint, not here.
 */
export function canManageLead(
  user: AuthenticatedUser,
  lead: { assigned_to: string | null; team_id: string | null },
): boolean {
  if (user.role === 'super_admin') return true;
  if (lead.assigned_to === user.id) return true;
  if (lead.team_id === null) return false;
  if (user.role === 'team_leader') {
    return user.led_team_ids.includes(lead.team_id);
  }
  return user.member_team_ids.includes(lead.team_id);
}

/**
 * Returns the Prisma `where` filter for Project rows the caller can see.
 *   super_admin → all
 *   team_leader → projects of teams they lead
 *   intern      → projects of teams they belong to
 */
export function projectScopeWhere(user: AuthenticatedUser): Prisma.ProjectWhereInput {
  if (user.role === 'super_admin') return {};
  if (user.role === 'team_leader') {
    return { team_id: { in: user.led_team_ids } };
  }
  return { team_id: { in: user.member_team_ids } };
}

export function canManageProject(user: AuthenticatedUser, project: { team_id: string }): boolean {
  if (user.role === 'super_admin') return true;
  if (user.role === 'team_leader') return user.led_team_ids.includes(project.team_id);
  return false;
}

/**
 * Returns the Prisma `where` filter for Task rows the caller can see.
 * Tasks aren't directly team-scoped; they inherit team scope via project/lead.
 *
 *   super_admin → all
 *   team_leader → tasks they created, tasks assigned to them, or tasks whose
 *                 project/lead belongs to a team they lead
 *   intern      → tasks assigned to them
 */
export function taskScopeWhere(user: AuthenticatedUser): Prisma.TaskWhereInput {
  if (user.role === 'super_admin') return {};
  if (user.role === 'team_leader') {
    return {
      OR: [
        { assignee_id: user.id },
        { created_by: user.id },
        { project: { team_id: { in: user.led_team_ids } } },
        { lead: { team_id: { in: user.led_team_ids } } },
      ],
    };
  }
  return { assignee_id: user.id };
}

interface TaskScopeRow {
  assignee_id: string | null;
  created_by: string;
  project: { team_id: string } | null;
  lead: { team_id: string | null } | null;
}

/**
 * Can the user modify a specific task (progress, status, comments, edits)?
 *   Admin: always
 *   Assignee: yes (FR-TASK-3)
 *   Creator: yes
 *   Leader of the project/lead's team: yes
 */
export function canManageTask(user: AuthenticatedUser, task: TaskScopeRow): boolean {
  if (user.role === 'super_admin') return true;
  if (task.assignee_id === user.id) return true;
  if (task.created_by === user.id) return true;
  if (user.role === 'team_leader') {
    const projectTeam = task.project?.team_id;
    const leadTeam = task.lead?.team_id ?? null;
    if (projectTeam && user.led_team_ids.includes(projectTeam)) return true;
    if (leadTeam && user.led_team_ids.includes(leadTeam)) return true;
  }
  return false;
}

/**
 * Reviewer = admin, or leader of the project/lead's team, or creator.
 * Assignees cannot review their own work (FR-TASK-4).
 */
export function canReviewTask(user: AuthenticatedUser, task: TaskScopeRow): boolean {
  if (user.role === 'super_admin') return true;
  if (task.assignee_id === user.id) return false;
  if (task.created_by === user.id) return true;
  if (user.role === 'team_leader') {
    const projectTeam = task.project?.team_id;
    const leadTeam = task.lead?.team_id ?? null;
    if (projectTeam && user.led_team_ids.includes(projectTeam)) return true;
    if (leadTeam && user.led_team_ids.includes(leadTeam)) return true;
  }
  return false;
}

/**
 * Returns the Prisma `where` filter for Attendance rows the caller can see.
 *   super_admin → all
 *   team_leader → their own + members of teams they lead
 *   intern      → only their own
 */
export function attendanceScopeWhere(user: AuthenticatedUser): Prisma.AttendanceWhereInput {
  if (user.role === 'super_admin') return {};
  if (user.role === 'team_leader') {
    return {
      OR: [
        { user_id: user.id },
        { user: { memberships: { some: { team_id: { in: user.led_team_ids } } } } },
      ],
    };
  }
  return { user_id: user.id };
}

/**
 * Returns the Prisma `where` filter for DailyReport rows the caller can see.
 * Same logic as attendance: self for interns; self + led-team members for leaders; all for admin.
 */
export function dailyReportScopeWhere(user: AuthenticatedUser): Prisma.DailyReportWhereInput {
  if (user.role === 'super_admin') return {};
  if (user.role === 'team_leader') {
    return {
      OR: [
        { user_id: user.id },
        { author: { memberships: { some: { team_id: { in: user.led_team_ids } } } } },
      ],
    };
  }
  return { user_id: user.id };
}

/**
 * True if `actor` can review (acknowledge/leave feedback on) a daily report
 * authored by `authorId`. Admins always; leaders if the author is in one of
 * their teams. Self-review is disallowed.
 */
export function canReviewDailyReport(
  actor: AuthenticatedUser,
  author: { id: string; team_ids: string[] },
): boolean {
  if (actor.id === author.id) return false;
  if (actor.role === 'super_admin') return true;
  if (actor.role === 'team_leader') {
    return author.team_ids.some((t) => actor.led_team_ids.includes(t));
  }
  return false;
}

/**
 * Can `actor` mark/override attendance for `targetUserId`?
 * Admin: always. Leader: members of teams they lead. Intern: themselves only.
 */
export function canMarkAttendanceFor(
  actor: AuthenticatedUser,
  target: { id: string; team_ids: string[] },
): boolean {
  if (actor.role === 'super_admin') return true;
  if (actor.id === target.id) return true;
  if (actor.role === 'team_leader') {
    return target.team_ids.some((t) => actor.led_team_ids.includes(t));
  }
  return false;
}

/**
 * Returns the Prisma `where` filter for Ticket rows the caller can see.
 *   super_admin → all
 *   team_leader → tickets they raised, tickets assigned to them, or tickets
 *                 attached to a team they lead
 *   intern      → tickets they raised (their own)
 */
export function ticketScopeWhere(user: AuthenticatedUser): Prisma.TicketWhereInput {
  if (user.role === 'super_admin') return {};
  if (user.role === 'team_leader') {
    return {
      OR: [
        { raised_by: user.id },
        { assigned_to: user.id },
        { team_id: { in: user.led_team_ids } },
      ],
    };
  }
  return { raised_by: user.id };
}

interface TicketScopeRow {
  raised_by: string;
  assigned_to: string | null;
  team_id: string | null;
}

/**
 * Can the user act on (status-change/assign/respond to) a ticket?
 *   Admin: always.
 *   Assignee: yes.
 *   Leader of the ticket's team: yes.
 *   Raiser: can post messages and reopen their own ticket — handled by
 *     `canRespondToTicket` below since the bar is lower.
 */
export function canManageTicket(user: AuthenticatedUser, ticket: TicketScopeRow): boolean {
  if (user.role === 'super_admin') return true;
  if (ticket.assigned_to === user.id) return true;
  if (user.role === 'team_leader' && ticket.team_id && user.led_team_ids.includes(ticket.team_id)) {
    return true;
  }
  return false;
}

/**
 * Anyone in the conversation can post a message on a ticket they can see —
 * raiser, assignee, leader of the team, or admin.
 */
export function canRespondToTicket(user: AuthenticatedUser, ticket: TicketScopeRow): boolean {
  if (canManageTicket(user, ticket)) return true;
  return ticket.raised_by === user.id;
}

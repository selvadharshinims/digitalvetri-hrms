import type { AttendanceStatus, Role } from './enums';
import type { LeadFunnel, LeadListItem } from './lead';
import type { LeaderboardEntry, PerformanceBand, PerformanceScoreResult } from './performance';
import type { TaskListItem } from './task';
import type { TicketListItem } from './ticket';
import type { DailyReportListItem } from './daily-report';

/**
 * Headline KPI cards on the owner / leader dashboard (FR-DSH-1).
 * Numbers reflect the active state of the org (or team scope).
 */
export interface DashboardKpis {
  total_interns: number;
  active_teams: number;
  active_projects: number;
  leads_generated: number;
  leads_converted: number;
  open_tickets: number;
}

/** FR-DSH-2 — today's attendance breakdown. */
export interface TodayAttendanceSummary {
  present: number;
  late: number;
  half_day: number;
  leave: number;
  absent: number;
  no_mark: number;
  total: number;
}

/** Team-level rollup for the team performance bar chart (FR-DSH-4). */
export interface TeamPerformanceRow {
  team_id: string;
  team_name: string;
  avg_score: number;
  member_count: number;
}

/** Exceptions panel (FR-DSH-6) — counts plus a few preview rows for drill-through. */
export interface DashboardExceptions {
  missing_reports_today: number;
  stale_leads: number;
  overdue_tasks: number;
  unattended_tickets: number;
  /** A handful of preview rows so the panel shows examples, not just numbers. */
  preview: {
    missing_reports_users: { user_id: string; full_name: string }[];
    stale_lead_titles: { id: string; name: string }[];
    overdue_task_titles: { id: string; title: string; assignee?: string | null }[];
    unattended_ticket_titles: { id: string; title: string; priority: string }[];
  };
}

/** Owner + leader payload (leader version is scoped to their teams). */
export interface StaffDashboard {
  kpis: DashboardKpis;
  attendance_today: TodayAttendanceSummary;
  funnel: LeadFunnel;
  top_performers: LeaderboardEntry[];
  team_performance: TeamPerformanceRow[];
  exceptions: DashboardExceptions;
  /** Leader-only: extra review queues. Absent for owner. */
  pending_review?: {
    daily_reports: number;
    tasks: number;
  };
}

/** Intern personal-loop payload (PRD §14.4 wireframe). */
export interface InternDashboard {
  my_score: PerformanceScoreResult | null;
  my_band: PerformanceBand | null;
  today_tasks: TaskListItem[];
  upcoming_followups: LeadListItem[];
  today_report: DailyReportListItem | null;
  my_attendance_today: {
    status: AttendanceStatus | null;
    check_in: string | null;
    check_out: string | null;
  };
  my_open_tickets: TicketListItem[];
}

export type DashboardResponse =
  | { role: 'super_admin'; staff: StaffDashboard }
  | { role: 'team_leader'; staff: StaffDashboard }
  | { role: 'intern'; intern: InternDashboard };

export type StaffDashboardResponse = Extract<DashboardResponse, { staff: StaffDashboard }>;
export type InternDashboardResponse = Extract<DashboardResponse, { intern: InternDashboard }>;

export const dashboardIsStaff = (
  r: DashboardResponse,
): r is StaffDashboardResponse => r.role !== 'intern';

export type { Role };

export type TeamInsightsWindow = 7 | 14 | 30;

export interface TeamInsightsRequest {
  days?: TeamInsightsWindow;
}

export interface TeamInsightsResponse {
  markdown: string;
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
  window_start: string;
  window_end: string;
  window_days: number;
  teams_total: number;
  generated_at: string;
}

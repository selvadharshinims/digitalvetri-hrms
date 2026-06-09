import type { LeadFunnel } from './lead';
import type { PerformanceBand } from './performance';

export const REPORT_TYPES = [
  'team-performance',
  'lead-performance',
  'attendance',
  'project-progress',
  'intern-rankings',
  'conversion',
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export interface ReportMeta {
  from: string;
  to: string;
  generated_at: string;
  team_id: string | null;
}

export interface ReportEnvelope<T> {
  data: T[];
  meta: ReportMeta;
}

export interface TeamPerformanceReportRow {
  team_id: string;
  team_name: string;
  member_count: number;
  avg_score: number;
  leads_generated: number;
  leads_converted: number;
  conversion_rate_pct: number;
  tasks_completed: number;
  attendance_avg_pct: number;
}

export interface LeadPerformanceReportRow {
  user_id: string;
  full_name: string;
  team_names: string[];
  leads_assigned: number;
  leads_worked: number;
  leads_converted: number;
  conversion_rate_pct: number;
  total_deal_value: number;
}

export interface ProjectProgressReportRow {
  project_id: string;
  project_name: string;
  team_name: string | null;
  client_name: string | null;
  status: string;
  progress_pct: number;
  derived_progress_pct: number;
  deliverables_done: number;
  deliverables_total: number;
  tasks_completed: number;
  tasks_total: number;
  deadline: string | null;
  deadline_risk: 'none' | 'approaching' | 'overdue';
}

export interface InternRankingReportRow {
  rank: number;
  user_id: string;
  full_name: string;
  team_names: string[];
  total_score: number;
  band: PerformanceBand;
  attendance_score: number;
  task_score: number;
  lead_score: number;
  project_score: number;
  feedback_score: number;
  discipline_score: number;
}

export interface ConversionSourceRow {
  source: string;
  worked: number;
  converted: number;
  conversion_rate_pct: number;
  total_value: number;
}

export interface ConversionReport {
  funnel: LeadFunnel;
  total_deal_value: number;
  avg_deal_value: number;
  by_source: ConversionSourceRow[];
}

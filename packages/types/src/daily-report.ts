export interface DailyReport {
  id: string;
  user_id: string;
  report_date: string;
  todays_work: string;
  challenges: string | null;
  learnings: string | null;
  tomorrows_plan: string | null;
  is_locked: boolean;
  reviewed_by: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  submitted_late: boolean;
  created_at: string;
  updated_at: string;
}

export interface SubmitDailyReportRequest {
  report_date: string;
  todays_work: string;
  challenges?: string;
  learnings?: string;
  tomorrows_plan?: string;
}

export interface ReviewDailyReportRequest {
  review_note?: string;
  acknowledged: boolean;
}

export interface MissingReportEntry {
  user_id: string;
  full_name: string;
  team_ids: string[];
  missing_dates: string[];
}

export interface DailyReportListItem extends DailyReport {
  author: { id: string; full_name: string; email: string } | null;
  reviewer: { id: string; full_name: string } | null;
}

export type DigestRange = 'yesterday' | 'this_week' | 'last_7_days' | 'custom';

export interface DigestRequest {
  range?: DigestRange;
  from?: string;
  to?: string;
  team_id?: string;
}

export interface DigestResponse {
  markdown: string;
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
  period_start: string;
  period_end: string;
  period_label: string;
  reports_total: number;
  missing_total: number;
  generated_at: string;
}

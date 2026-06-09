/**
 * Performance scoring contracts. See PRD §10 for formulas and defaults.
 */

export interface PerformanceWeights {
  attendance: number;
  task: number;
  lead: number;
  project: number;
  feedback: number;
  discipline: number;
}

export const DEFAULT_WEIGHTS: PerformanceWeights = {
  attendance: 0.15,
  task: 0.25,
  lead: 0.25,
  project: 0.15,
  feedback: 0.15,
  discipline: 0.05,
};

export interface PerformanceScore {
  id: string;
  user_id: string;
  period_start: string;
  period_end: string;
  attendance_score: number;
  task_score: number;
  lead_score: number;
  project_score: number;
  feedback_score: number;
  discipline_score: number;
  total_score: number;
  weights_used: PerformanceWeights;
  computed_at: string;
}

export interface PerformanceFeedback {
  id: string;
  user_id: string;
  leader_id: string;
  period_start: string;
  period_end: string;
  /** 1–5 */
  quality: number;
  /** 1–5 */
  ownership: number;
  /** 1–5 */
  collaboration: number;
  note: string | null;
  created_at: string;
}

export interface SubmitFeedbackRequest {
  user_id: string;
  period_start: string;
  period_end: string;
  quality: number;
  ownership: number;
  collaboration: number;
  note?: string;
}

export type PerformanceBand = 'outstanding' | 'strong' | 'developing' | 'needs_support';

export interface LeaderboardEntry {
  user_id: string;
  full_name: string;
  team_ids: string[];
  total_score: number;
  band: PerformanceBand;
  rank: number;
}

export interface ScoringConfig {
  weights: PerformanceWeights;
  stale_lead_days: number;
  report_cutoff: string;
  work_start_time: string;
  scoring_period_days: number;
  lead_activity_target: number;
  updated_at?: string;
  updated_by?: string | null;
}

export interface PerformanceScoreResult {
  id?: string;
  user_id: string;
  period_start: string;
  period_end: string;
  attendance_score: number;
  task_score: number;
  lead_score: number;
  project_score: number;
  feedback_score: number;
  discipline_score: number;
  total_score: number;
  weights_used: PerformanceWeights;
  band: PerformanceBand;
  computed_at: string;
}

export interface PerformanceFeedbackWithLeader extends PerformanceFeedback {
  leader: { id: string; full_name: string } | null;
}

export interface UpdateScoringConfigRequest {
  weights?: PerformanceWeights;
  stale_lead_days?: number;
  report_cutoff?: string;
  work_start_time?: string;
  scoring_period_days?: number;
  lead_activity_target?: number;
}

export interface AiAnalysisResponse {
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
  generated_at: string;
}

import type { LeadStatus } from './enums';

export interface Lead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  service_interest: string | null;
  location: string | null;
  notes: string | null;
  estimated_value: number | null;
  status: LeadStatus;
  assigned_to: string | null;
  team_id: string | null;
  next_follow_up: string | null;
  deal_value: number | null;
  converted_at: string | null;
  last_activity_at: string | null;
  ai_score: number | null;
  ai_score_band: AiScoreBand | null;
  ai_score_signal: string | null;
  ai_score_action: string | null;
  ai_score_model: string | null;
  ai_score_at: string | null;
  created_at: string;
  updated_at: string;
}

export type AiScoreBand = 'hot' | 'warm' | 'cold' | 'invalid';

export interface LeadActivity {
  id: string;
  lead_id: string;
  actor_id: string;
  from_status: LeadStatus | null;
  to_status: LeadStatus | null;
  note: string | null;
  created_at: string;
}

export interface CreateLeadRequest {
  name: string;
  phone?: string;
  email?: string;
  source?: string;
  service_interest?: string;
  location?: string;
  notes?: string;
  estimated_value?: number;
  team_id?: string;
  assigned_to?: string;
}

export interface UpdateLeadStatusRequest {
  status: LeadStatus;
  note?: string;
  next_follow_up?: string;
  deal_value?: number;
}

export interface AssignLeadRequest {
  assignee_id: string;
}

export interface LeadListItem extends Lead {
  assignee: { id: string; full_name: string } | null;
  team: { id: string; name: string } | null;
}

export interface LeadDetail extends LeadListItem {
  activities: LeadActivity[];
}

export interface ImportLeadRow {
  name: string;
  phone?: string;
  email?: string;
  source?: string;
  service_interest?: string;
  location?: string;
  notes?: string;
  estimated_value?: number;
  team_id?: string;
  assigned_to?: string;
}

export interface ImportLeadsRequest {
  team_id?: string;
  assigned_to?: string;
  rows: ImportLeadRow[];
}

export interface ImportLeadsResponse {
  imported: number;
  skipped_duplicates: number;
  errors: { row: number; message: string }[];
}

export interface LeadFunnel {
  new: number;
  contacted: number;
  interested: number;
  follow_up: number;
  converted: number;
  lost: number;
  invalid: number;
}

export interface ScoreLeadsRequest {
  /** Optional explicit list. If omitted, scores all open in-scope leads (max 30). */
  lead_ids?: string[];
}

export interface ScoredLead {
  lead_id: string;
  score: number;
  band: AiScoreBand;
  top_signal: string;
  suggested_action: string;
}

export interface ScoreLeadsResponse {
  scored: ScoredLead[];
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
  generated_at: string;
}

import type { ProjectStatus } from './enums';

export type ProjectRiskBand = 'on_track' | 'at_risk' | 'off_track' | 'stalled';

export interface Project {
  id: string;
  name: string;
  description: string | null;
  client_name: string | null;
  category: string | null;
  team_id: string;
  status: ProjectStatus;
  progress_pct: number;
  start_date: string | null;
  deadline: string | null;
  ai_risk_score: number | null;
  ai_risk_band: ProjectRiskBand | null;
  ai_risk_concern: string | null;
  ai_risk_actions: string[] | null;
  ai_risk_model: string | null;
  ai_risk_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectDeliverable {
  id: string;
  project_id: string;
  title: string;
  is_done: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  client_name?: string;
  category?: string;
  team_id: string;
  start_date?: string;
  deadline?: string;
}

export interface UpdateProjectRequest extends Partial<CreateProjectRequest> {
  status?: ProjectStatus;
  progress_pct?: number;
}

export interface CreateDeliverableRequest {
  title: string;
}

export interface UpdateDeliverableRequest {
  title?: string;
  is_done?: boolean;
}

export type DeadlineRisk = 'none' | 'approaching' | 'overdue';

export interface ProjectListItem extends Project {
  team: { id: string; name: string } | null;
  deliverables_total: number;
  deliverables_done: number;
  tasks_total: number;
  tasks_completed: number;
  derived_progress_pct: number;
  deadline_risk: DeadlineRisk;
}

export interface ProjectTaskSummary {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignee: { id: string; full_name: string } | null;
  due_date: string | null;
  progress_pct: number;
}

export interface ProjectDetail extends ProjectListItem {
  deliverables: ProjectDeliverable[];
  tasks: ProjectTaskSummary[];
}

export interface AssessProjectRisksRequest {
  /** Optional explicit list. If omitted, assesses all in-scope non-terminal projects (max 20). */
  project_ids?: string[];
}

export interface AssessedProject {
  project_id: string;
  score: number;
  band: ProjectRiskBand;
  top_concern: string;
  suggested_actions: string[];
}

export interface AssessProjectRisksResponse {
  assessed: AssessedProject[];
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
  generated_at: string;
}

import type { TaskPriority, TaskStatus } from './enums';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  project_id: string | null;
  lead_id: string | null;
  created_by: string;
  priority: TaskPriority;
  status: TaskStatus;
  progress_pct: number;
  block_reason: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskActivity {
  id: string;
  task_id: string;
  actor_id: string;
  action: string;
  note: string | null;
  created_at: string;
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  assignee_id?: string;
  project_id?: string;
  lead_id?: string;
  priority?: TaskPriority;
  due_date?: string;
}

export interface UpdateTaskRequest extends Partial<CreateTaskRequest> {
  status?: TaskStatus;
  progress_pct?: number;
  block_reason?: string;
}

export interface ReviewTaskRequest {
  decision: 'approve' | 'reopen';
  feedback?: string;
}

export interface CommentTaskRequest {
  note: string;
}

export interface TaskListItem extends Task {
  assignee: { id: string; full_name: string } | null;
  creator: { id: string; full_name: string } | null;
  project: { id: string; name: string; team_id: string } | null;
  lead: { id: string; name: string } | null;
  is_overdue: boolean;
}

export interface TaskDetail extends TaskListItem {
  activities: TaskActivity[];
}

export interface TasksByStatus {
  todo: TaskListItem[];
  in_progress: TaskListItem[];
  in_review: TaskListItem[];
  completed: TaskListItem[];
  blocked: TaskListItem[];
}

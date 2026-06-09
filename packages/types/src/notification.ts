export type NotificationType =
  | 'task_assigned'
  | 'task_reviewed'
  | 'project_updated'
  | 'lead_assigned'
  | 'lead_followup_due'
  | 'ticket_response'
  | 'ticket_status_changed'
  | 'attendance_reminder'
  | 'report_reminder'
  | 'feedback_received'
  | 'system';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType | string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export interface MarkNotificationReadRequest {
  notification_ids?: string[];
  all?: boolean;
}

export interface UnreadCountResponse {
  unread: number;
}

export interface NotificationsListResponse {
  data: Notification[];
  meta: { page: number; limit: number; total: number; unread: number };
}

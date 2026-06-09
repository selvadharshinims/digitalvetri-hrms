import type { TicketPriority, TicketStatus, TicketType } from './enums';

export interface Ticket {
  id: string;
  raised_by: string;
  type: TicketType;
  priority: TicketPriority;
  title: string;
  description: string;
  status: TicketStatus;
  assigned_to: string | null;
  team_id: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export interface TicketMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  message: string;
  created_at: string;
}

export interface CreateTicketRequest {
  type: TicketType;
  priority?: TicketPriority;
  title: string;
  description: string;
  team_id?: string;
}

export interface UpdateTicketStatusRequest {
  status: TicketStatus;
  message?: string;
}

export interface SendTicketMessageRequest {
  message: string;
}

export interface AssignTicketRequest {
  assignee_id: string;
}

export interface TicketListItem extends Ticket {
  raiser: { id: string; full_name: string; email: string } | null;
  assignee: { id: string; full_name: string } | null;
  team: { id: string; name: string } | null;
  /** Hours since `created_at`. Computed server-side. */
  age_hours: number;
  /** True when status is open/in_progress and `age_hours` exceeds the SLA threshold. */
  is_unattended: boolean;
  message_count: number;
}

export interface TicketMessageWithSender extends TicketMessage {
  sender: { id: string; full_name: string; role: string } | null;
}

export interface TicketDetail extends TicketListItem {
  messages: TicketMessageWithSender[];
}

/**
 * String-union enums that mirror the Prisma enums in apps/api/prisma/schema.prisma.
 * Kept as unions (not TS enums) so they serialize cleanly across the wire.
 */

export const ROLES = ['super_admin', 'team_leader', 'intern'] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ['active', 'inactive', 'completed'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const LEAD_STATUSES = [
  'new',
  'contacted',
  'interested',
  'follow_up',
  'converted',
  'lost',
  'invalid',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const PROJECT_STATUSES = [
  'planning',
  'in_progress',
  'on_hold',
  'completed',
  'cancelled',
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_STATUSES = [
  'todo',
  'in_progress',
  'in_review',
  'completed',
  'blocked',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const ATTENDANCE_STATUSES = [
  'present',
  'absent',
  'leave',
  'half_day',
  'late',
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const TICKET_TYPES = [
  'technical',
  'leave_request',
  'project_support',
  'access_request',
  'general',
] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export const TICKET_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

import type { AttendanceStatus } from './enums';

export interface Attendance {
  id: string;
  user_id: string;
  date: string;
  status: AttendanceStatus;
  check_in: string | null;
  check_out: string | null;
  marked_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarkAttendanceRequest {
  user_id: string;
  date: string;
  status: AttendanceStatus;
  notes?: string;
}

export interface AttendanceReportRow {
  user_id: string;
  full_name: string;
  working_days: number;
  present: number;
  absent: number;
  leave: number;
  half_day: number;
  late: number;
  attendance_pct: number;
}

export interface AttendanceListItem extends Attendance {
  user: { id: string; full_name: string; email: string } | null;
}

export interface TodayAttendanceRow {
  user_id: string;
  full_name: string;
  email: string;
  status: AttendanceStatus | null;
  check_in: string | null;
  check_out: string | null;
  notes: string | null;
  attendance_id: string | null;
}

export interface CheckInResult {
  attendance: Attendance;
  late: boolean;
}

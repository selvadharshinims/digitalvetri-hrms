'use client';

import type {
  Attendance,
  AttendanceListItem,
  AttendanceReportRow,
  AttendanceStatus,
  CheckInResult,
  MarkAttendanceRequest,
  TodayAttendanceRow,
} from '@dv-wms/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';

export interface ListAttendanceParams {
  page?: number;
  limit?: number;
  user_id?: string;
  team_id?: string;
  status?: AttendanceStatus;
  from?: string;
  to?: string;
}

interface PaginatedAttendance {
  data: AttendanceListItem[];
  meta: { page: number; limit: number; total: number };
}

function buildQuery(params: object): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') usp.set(k, String(v));
  }
  const q = usp.toString();
  return q ? `?${q}` : '';
}

export function useListAttendance(params: ListAttendanceParams) {
  return useQuery({
    queryKey: ['attendance', params],
    queryFn: async (): Promise<PaginatedAttendance> => {
      const res = await apiFetch<AttendanceListItem[]>(`/attendance${buildQuery(params)}`);
      return {
        data: (res.data ?? []) as AttendanceListItem[],
        meta: {
          page: res.meta?.page ?? params.page ?? 1,
          limit: res.meta?.limit ?? params.limit ?? 25,
          total: res.meta?.total ?? 0,
        },
      };
    },
  });
}

export function useAttendanceToday(team_id?: string) {
  return useQuery({
    queryKey: ['attendance-today', team_id ?? null],
    queryFn: async () => {
      const res = await apiFetch<TodayAttendanceRow[]>(
        `/attendance/today${team_id ? `?team_id=${team_id}` : ''}`,
      );
      return res.data ?? [];
    },
  });
}

export function useAttendanceReport(params: { team_id?: string; month?: string }) {
  return useQuery({
    queryKey: ['attendance-report', params],
    queryFn: async () => {
      const res = await apiFetch<AttendanceReportRow[]>(`/attendance/report${buildQuery(params)}`);
      return res.data ?? [];
    },
  });
}

export function useCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<CheckInResult> => {
      const res = await apiFetch<CheckInResult>(`/attendance/check-in`, { method: 'POST' });
      if (!res.data) throw new Error('Check-in failed');
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance'] });
      qc.invalidateQueries({ queryKey: ['attendance-today'] });
    },
  });
}

export function useCheckOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiFetch<Attendance>(`/attendance/check-out`, { method: 'POST' });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance'] });
      qc.invalidateQueries({ queryKey: ['attendance-today'] });
    },
  });
}

export function useMarkAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: MarkAttendanceRequest) => {
      const res = await apiFetch<Attendance>(`/attendance/mark`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance'] });
      qc.invalidateQueries({ queryKey: ['attendance-today'] });
      qc.invalidateQueries({ queryKey: ['attendance-report'] });
    },
  });
}

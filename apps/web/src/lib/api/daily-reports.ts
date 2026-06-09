'use client';

import type {
  DailyReport,
  DailyReportListItem,
  DigestRequest,
  DigestResponse,
  MissingReportEntry,
  ReviewDailyReportRequest,
  SubmitDailyReportRequest,
} from '@dv-wms/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';

export interface ListReportsParams {
  page?: number;
  limit?: number;
  user_id?: string;
  team_id?: string;
  from?: string;
  to?: string;
  q?: string;
  pending_review?: boolean;
}

interface PaginatedReports {
  data: DailyReportListItem[];
  meta: { page: number; limit: number; total: number };
}

interface MissingReportsResponse {
  window_days: string[];
  users: MissingReportEntry[];
}

function buildQuery(params: object): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') usp.set(k, String(v));
  }
  const q = usp.toString();
  return q ? `?${q}` : '';
}

export function useListReports(params: ListReportsParams) {
  return useQuery({
    queryKey: ['daily-reports', params],
    queryFn: async (): Promise<PaginatedReports> => {
      const res = await apiFetch<DailyReportListItem[]>(`/daily-reports${buildQuery(params)}`);
      return {
        data: (res.data ?? []) as DailyReportListItem[],
        meta: {
          page: res.meta?.page ?? params.page ?? 1,
          limit: res.meta?.limit ?? params.limit ?? 25,
          total: res.meta?.total ?? 0,
        },
      };
    },
  });
}

export function useMyReport(date?: string) {
  return useQuery({
    queryKey: ['daily-report-mine', date ?? 'today'],
    queryFn: async () => {
      const res = await apiFetch<DailyReportListItem | null>(
        `/daily-reports/mine${date ? `?date=${date}` : ''}`,
      );
      return res.data ?? null;
    },
  });
}

export function useGetReport(id: string | undefined) {
  return useQuery({
    queryKey: ['daily-report', id],
    enabled: !!id,
    queryFn: async () => {
      const res = await apiFetch<DailyReportListItem>(`/daily-reports/${id}`);
      if (!res.data) throw new Error('Report not found');
      return res.data;
    },
  });
}

export function useMissingReports(params: { team_id?: string; days?: number } = {}) {
  return useQuery({
    queryKey: ['daily-reports-missing', params],
    queryFn: async () => {
      const res = await apiFetch<MissingReportsResponse>(
        `/daily-reports/missing${buildQuery(params)}`,
      );
      return (res.data as MissingReportsResponse) ?? { window_days: [], users: [] };
    },
  });
}

export function useSubmitReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: SubmitDailyReportRequest): Promise<DailyReport> => {
      const res = await apiFetch<DailyReport>(`/daily-reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.data) throw new Error('Submit failed');
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['daily-reports'] });
      qc.invalidateQueries({ queryKey: ['daily-report-mine'] });
      qc.invalidateQueries({ queryKey: ['daily-reports-missing'] });
    },
  });
}

export function useReviewReport(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: ReviewDailyReportRequest) => {
      const res = await apiFetch<DailyReport>(`/daily-reports/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['daily-report', id] });
      qc.invalidateQueries({ queryKey: ['daily-reports'] });
    },
  });
}

/**
 * Generates an AI-written digest of the visible cohort's reports across a
 * date window. Returns 503 if ANTHROPIC_API_KEY isn't configured.
 */
export function useGenerateDailyReportDigest() {
  return useMutation({
    mutationFn: async (body: DigestRequest = {}): Promise<DigestResponse> => {
      const usp = new URLSearchParams();
      for (const [k, v] of Object.entries(body)) {
        if (v !== undefined && v !== null && v !== '') usp.set(k, String(v));
      }
      const qs = usp.toString();
      const res = await apiFetch<DigestResponse>(
        `/daily-reports/digest${qs ? `?${qs}` : ''}`,
        { method: 'POST' },
      );
      if (!res.data) throw new Error('Digest returned no payload');
      return res.data;
    },
  });
}

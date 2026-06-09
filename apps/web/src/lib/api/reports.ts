'use client';

import type {
  AttendanceReportRow,
  ConversionReport,
  InternRankingReportRow,
  LeadPerformanceReportRow,
  ProjectProgressReportRow,
  ReportEnvelope,
  ReportType,
  TeamPerformanceReportRow,
} from '@dv-wms/types';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuthStore } from '../auth-store';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1';

export interface ReportParams {
  from?: string;
  to?: string;
  team_id?: string;
}

function buildQuery(params: object): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') usp.set(k, String(v));
  }
  const q = usp.toString();
  return q ? `?${q}` : '';
}

function makeJsonHook<T>(path: string) {
  return function useJsonReport(params: ReportParams) {
    return useQuery({
      queryKey: ['report', path, params],
      queryFn: async () => {
        const res = await apiFetch<T[]>(`/reports/${path}${buildQuery(params)}`);
        // Reports return their own { data, meta } envelope; apiFetch hands back
        // ApiEnvelope<T[]>. Adapt to ReportEnvelope.
        return {
          data: (res.data ?? []) as T[],
          meta: (res.meta ?? {}) as ReportEnvelope<T>['meta'],
        };
      },
    });
  };
}

export const useTeamPerformanceReport = makeJsonHook<TeamPerformanceReportRow>(
  'team-performance',
);
export const useLeadPerformanceReport = makeJsonHook<LeadPerformanceReportRow>(
  'lead-performance',
);
export const useAttendanceReportFull = makeJsonHook<AttendanceReportRow>('attendance');
export const useProjectProgressReport = makeJsonHook<ProjectProgressReportRow>(
  'project-progress',
);
export const useInternRankingsReport = makeJsonHook<InternRankingReportRow>(
  'intern-rankings',
);
export const useConversionReport = makeJsonHook<ConversionReport>('conversion');

/**
 * Downloads a CSV by hitting the same endpoint with `format=csv`. We use a
 * dedicated fetch (not `apiFetch`) so we can read the body as text/blob and
 * trigger a browser download.
 */
export async function downloadReportCsv(
  report: ReportType,
  params: ReportParams,
): Promise<void> {
  const token = useAuthStore.getState().access_token;
  const url = `${API_BASE_URL}/reports/${report}${buildQuery({ ...params, format: 'csv' })}`;
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `CSV download failed (${res.status})`);
  }
  const blob = await res.blob();
  const filename =
    parseFilename(res.headers.get('Content-Disposition')) ??
    `${report}-${new Date().toISOString().slice(0, 10)}.csv`;
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}

function parseFilename(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/filename="?([^";]+)"?/i);
  return match ? match[1]! : null;
}

'use client';

import type {
  DashboardResponse,
  TeamInsightsRequest,
  TeamInsightsResponse,
} from '@dv-wms/types';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api-client';

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await apiFetch<DashboardResponse>(`/dashboard`);
      return res.data as DashboardResponse;
    },
    staleTime: 30_000,
  });
}

/**
 * Generates an AI-written cross-team productivity narrative. Staff-only;
 * returns 503 if ANTHROPIC_API_KEY isn't configured.
 */
export function useGenerateTeamInsights() {
  return useMutation({
    mutationFn: async (body: TeamInsightsRequest = {}): Promise<TeamInsightsResponse> => {
      const res = await apiFetch<TeamInsightsResponse>(`/dashboard/team-insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.data) throw new Error('Team insights returned no payload');
      return res.data;
    },
  });
}

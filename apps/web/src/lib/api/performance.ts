'use client';

import type {
  AiAnalysisResponse,
  LeaderboardEntry,
  PerformanceFeedbackWithLeader,
  PerformanceScoreResult,
  SubmitFeedbackRequest,
} from '@dv-wms/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';

export interface ScoreQueryParams {
  period_start?: string;
  period_end?: string;
  rolling_days?: number;
  recompute?: boolean;
}

function buildQuery(params: object): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') usp.set(k, String(v));
  }
  const q = usp.toString();
  return q ? `?${q}` : '';
}

export function useMyScore(params: ScoreQueryParams = {}) {
  return useQuery({
    queryKey: ['performance-me', params],
    queryFn: async () => {
      const res = await apiFetch<PerformanceScoreResult>(`/performance/me${buildQuery(params)}`);
      return res.data as PerformanceScoreResult;
    },
  });
}

export function useMyScoreHistory() {
  return useQuery({
    queryKey: ['performance-me-history'],
    queryFn: async () => {
      const res = await apiFetch<PerformanceScoreResult[]>(`/performance/me/history`);
      return res.data ?? [];
    },
  });
}

export function useUserScore(userId: string | undefined, params: ScoreQueryParams = {}) {
  return useQuery({
    queryKey: ['performance-user', userId, params],
    enabled: !!userId,
    queryFn: async () => {
      const res = await apiFetch<PerformanceScoreResult>(
        `/performance/${userId}${buildQuery(params)}`,
      );
      return res.data as PerformanceScoreResult;
    },
  });
}

export function useUserScoreHistory(userId: string | undefined) {
  return useQuery({
    queryKey: ['performance-user-history', userId],
    enabled: !!userId,
    queryFn: async () => {
      const res = await apiFetch<PerformanceScoreResult[]>(`/performance/${userId}/history`);
      return res.data ?? [];
    },
  });
}

export function useUserFeedback(userId: string | undefined) {
  return useQuery({
    queryKey: ['performance-user-feedback', userId],
    enabled: !!userId,
    queryFn: async () => {
      const res = await apiFetch<PerformanceFeedbackWithLeader[]>(
        `/performance/${userId}/feedback`,
      );
      return res.data ?? [];
    },
  });
}

export function useLeaderboard(params: { team_id?: string; limit?: number } = {}) {
  return useQuery({
    queryKey: ['performance-leaderboard', params],
    queryFn: async () => {
      const res = await apiFetch<LeaderboardEntry[]>(
        `/performance/leaderboard${buildQuery(params)}`,
      );
      return res.data ?? [];
    },
  });
}

export function useSubmitFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: SubmitFeedbackRequest) => {
      const res = await apiFetch<PerformanceFeedbackWithLeader>(`/performance/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return res.data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['performance-user', vars.user_id] });
      qc.invalidateQueries({ queryKey: ['performance-user-feedback', vars.user_id] });
      qc.invalidateQueries({ queryKey: ['performance-leaderboard'] });
    },
  });
}

export function useRecomputePerformance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiFetch<{
        computed: number;
        failed: number;
        period_start: string;
        period_end: string;
      }>(`/performance/recompute`, { method: 'POST' });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['performance-me'] });
      qc.invalidateQueries({ queryKey: ['performance-user'] });
      qc.invalidateQueries({ queryKey: ['performance-leaderboard'] });
    },
  });
}

/**
 * Generates an AI narrative for one user. Returns 503 if ANTHROPIC_API_KEY
 * isn't configured on the server.
 */
export function useGenerateAiAnalysis(userId: string) {
  return useMutation({
    mutationFn: async (): Promise<AiAnalysisResponse> => {
      const res = await apiFetch<AiAnalysisResponse>(
        `/performance/${userId}/ai-analysis`,
        { method: 'POST' },
      );
      if (!res.data) throw new Error('AI analysis returned no payload');
      return res.data;
    },
  });
}

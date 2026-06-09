'use client';

import type {
  CreateLeadRequest,
  ImportLeadsRequest,
  ImportLeadsResponse,
  Lead,
  LeadActivity,
  LeadDetail,
  LeadFunnel,
  LeadListItem,
  LeadStatus,
  ScoreLeadsRequest,
  ScoreLeadsResponse,
  UpdateLeadStatusRequest,
} from '@dv-wms/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';

export interface ListLeadsParams {
  page?: number;
  limit?: number;
  q?: string;
  status?: LeadStatus;
  assigned_to?: string;
  team_id?: string;
  source?: string;
  unassigned?: boolean;
  from?: string;
  to?: string;
}

interface PaginatedLeads {
  data: LeadListItem[];
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

export function useListLeads(params: ListLeadsParams) {
  return useQuery({
    queryKey: ['leads', params],
    queryFn: async (): Promise<PaginatedLeads> => {
      const res = await apiFetch<LeadListItem[]>(`/leads${buildQuery(params)}`);
      return {
        data: (res.data ?? []) as LeadListItem[],
        meta: {
          page: res.meta?.page ?? params.page ?? 1,
          limit: res.meta?.limit ?? params.limit ?? 25,
          total: res.meta?.total ?? 0,
        },
      };
    },
  });
}

export function useLeadFunnel() {
  return useQuery({
    queryKey: ['leads-funnel'],
    queryFn: async () => {
      const res = await apiFetch<LeadFunnel>(`/leads/funnel`);
      return res.data as LeadFunnel;
    },
  });
}

export function useStaleLeads(days?: number) {
  return useQuery({
    queryKey: ['leads-stale', days ?? null],
    queryFn: async () => {
      const res = await apiFetch<LeadListItem[]>(`/leads/stale${days ? `?days=${days}` : ''}`);
      return res.data ?? [];
    },
  });
}

export function useGetLead(id: string | undefined) {
  return useQuery({
    queryKey: ['lead', id],
    enabled: !!id,
    queryFn: async () => {
      const res = await apiFetch<LeadDetail>(`/leads/${id}`);
      if (!res.data) throw new Error('Lead not found');
      return res.data;
    },
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateLeadRequest): Promise<Lead> => {
      const res = await apiFetch<Lead>(`/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.data) throw new Error('Create failed');
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['leads-funnel'] });
    },
  });
}

export function useImportLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: ImportLeadsRequest): Promise<ImportLeadsResponse> => {
      const res = await apiFetch<ImportLeadsResponse>(`/leads/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.data) throw new Error('Import failed');
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['leads-funnel'] });
    },
  });
}

export function useChangeLeadStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateLeadStatusRequest) => {
      const res = await apiFetch<Lead>(`/leads/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead', id] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['leads-funnel'] });
    },
  });
}

export function useAssignLead(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (assignee_id: string) => {
      const res = await apiFetch<Lead>(`/leads/${id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignee_id }),
      });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead', id] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useUpdateLead(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Partial<CreateLeadRequest> & { next_follow_up?: string }) => {
      const res = await apiFetch<Lead>(`/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead', id] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

/**
 * AI-scores leads in batch. With no body, scores the top open in-scope leads
 * (server caps at 30 per call). Returns 503 if ANTHROPIC_API_KEY isn't set.
 */
export function useScoreLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: ScoreLeadsRequest = {}): Promise<ScoreLeadsResponse> => {
      const res = await apiFetch<ScoreLeadsResponse>(`/leads/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.data) throw new Error('Scoring returned no payload');
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['lead'] });
    },
  });
}

export type { LeadActivity };

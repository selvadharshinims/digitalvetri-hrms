'use client';

import type {
  AssessProjectRisksRequest,
  AssessProjectRisksResponse,
  CreateDeliverableRequest,
  CreateProjectRequest,
  Project,
  ProjectDeliverable,
  ProjectDetail,
  ProjectListItem,
  ProjectStatus,
  UpdateDeliverableRequest,
  UpdateProjectRequest,
} from '@dv-wms/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';

export interface ListProjectsParams {
  page?: number;
  limit?: number;
  q?: string;
  status?: ProjectStatus;
  team_id?: string;
  at_risk?: boolean;
}

interface PaginatedProjects {
  data: ProjectListItem[];
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

export function useListProjects(params: ListProjectsParams) {
  return useQuery({
    queryKey: ['projects', params],
    queryFn: async (): Promise<PaginatedProjects> => {
      const res = await apiFetch<ProjectListItem[]>(`/projects${buildQuery(params)}`);
      return {
        data: (res.data ?? []) as ProjectListItem[],
        meta: {
          page: res.meta?.page ?? params.page ?? 1,
          limit: res.meta?.limit ?? params.limit ?? 25,
          total: res.meta?.total ?? 0,
        },
      };
    },
  });
}

export function useGetProject(id: string | undefined) {
  return useQuery({
    queryKey: ['project', id],
    enabled: !!id,
    queryFn: async () => {
      const res = await apiFetch<ProjectDetail>(`/projects/${id}`);
      if (!res.data) throw new Error('Project not found');
      return res.data;
    },
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateProjectRequest): Promise<Project> => {
      const res = await apiFetch<Project>(`/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.data) throw new Error('Create failed');
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useUpdateProject(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateProjectRequest) => {
      const res = await apiFetch<Project>(`/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', id] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useSyncProjectProgress(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiFetch<Project>(`/projects/${id}/sync-progress`, { method: 'POST' });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', id] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useAddDeliverable(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateDeliverableRequest): Promise<ProjectDeliverable> => {
      const res = await apiFetch<ProjectDeliverable>(`/projects/${id}/deliverables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.data) throw new Error('Add deliverable failed');
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', id] }),
  });
}

export function useUpdateDeliverable(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      deliverableId,
      body,
    }: {
      deliverableId: string;
      body: UpdateDeliverableRequest;
    }): Promise<ProjectDeliverable> => {
      const res = await apiFetch<ProjectDeliverable>(
        `/projects/${projectId}/deliverables/${deliverableId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (!res.data) throw new Error('Update deliverable failed');
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', projectId] }),
  });
}

export function useRemoveDeliverable(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (deliverableId: string) => {
      const res = await apiFetch<{ removed: number }>(
        `/projects/${projectId}/deliverables/${deliverableId}`,
        { method: 'DELETE' },
      );
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', projectId] }),
  });
}

/**
 * AI-assesses delivery risk for a batch of projects. With no body, assesses
 * the top in-scope non-terminal projects (server caps at 20 per call).
 */
export function useAssessProjectRisks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      body: AssessProjectRisksRequest = {},
    ): Promise<AssessProjectRisksResponse> => {
      const res = await apiFetch<AssessProjectRisksResponse>(
        `/projects/assess-risk`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (!res.data) throw new Error('Risk assessment returned no payload');
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['project'] });
    },
  });
}

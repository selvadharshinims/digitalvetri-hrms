'use client';

import type {
  CommentTaskRequest,
  CreateTaskRequest,
  ReviewTaskRequest,
  Task,
  TaskActivity,
  TaskDetail,
  TaskListItem,
  TaskPriority,
  TaskStatus,
  TasksByStatus,
  UpdateTaskRequest,
} from '@dv-wms/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';

export interface ListTasksParams {
  page?: number;
  limit?: number;
  q?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignee_id?: string;
  project_id?: string;
  team_id?: string;
  overdue?: boolean;
}

interface PaginatedTasks {
  data: TaskListItem[];
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

export function useListTasks(params: ListTasksParams) {
  return useQuery({
    queryKey: ['tasks', params],
    queryFn: async (): Promise<PaginatedTasks> => {
      const res = await apiFetch<TaskListItem[]>(`/tasks${buildQuery(params)}`);
      return {
        data: (res.data ?? []) as TaskListItem[],
        meta: {
          page: res.meta?.page ?? params.page ?? 1,
          limit: res.meta?.limit ?? params.limit ?? 25,
          total: res.meta?.total ?? 0,
        },
      };
    },
  });
}

export function useMyTasks() {
  return useQuery({
    queryKey: ['tasks-mine'],
    queryFn: async () => {
      const res = await apiFetch<TaskListItem[]>(`/tasks/mine`);
      return res.data ?? [];
    },
  });
}

export function useTaskBoard(params: { project_id?: string; team_id?: string } = {}) {
  return useQuery({
    queryKey: ['tasks-board', params],
    queryFn: async () => {
      const res = await apiFetch<TasksByStatus>(`/tasks/board${buildQuery(params)}`);
      return res.data as TasksByStatus;
    },
  });
}

export function useGetTask(id: string | undefined) {
  return useQuery({
    queryKey: ['task', id],
    enabled: !!id,
    queryFn: async () => {
      const res = await apiFetch<TaskDetail>(`/tasks/${id}`);
      if (!res.data) throw new Error('Task not found');
      return res.data;
    },
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateTaskRequest): Promise<Task> => {
      const res = await apiFetch<Task>(`/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.data) throw new Error('Create failed');
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['tasks-board'] });
      qc.invalidateQueries({ queryKey: ['tasks-mine'] });
    },
  });
}

export function useUpdateTask(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateTaskRequest) => {
      const res = await apiFetch<Task>(`/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', id] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['tasks-board'] });
      qc.invalidateQueries({ queryKey: ['tasks-mine'] });
    },
  });
}

export function useReviewTask(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: ReviewTaskRequest) => {
      const res = await apiFetch<Task>(`/tasks/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', id] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['tasks-board'] });
      qc.invalidateQueries({ queryKey: ['tasks-mine'] });
    },
  });
}

export function useCommentTask(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CommentTaskRequest): Promise<TaskActivity> => {
      const res = await apiFetch<TaskActivity>(`/tasks/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.data) throw new Error('Comment failed');
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task', id] }),
  });
}

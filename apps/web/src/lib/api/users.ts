'use client';

import type {
  CreateUserRequest,
  CreateUserResponse,
  InviteUserResponse,
  Role,
  UpdateUserRequest,
  User,
  UserDetail,
  UserListItem,
  UserStatus,
  UserSummary,
} from '@dv-wms/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';

export interface ListUsersParams {
  page?: number;
  limit?: number;
  q?: string;
  role?: Role;
  status?: UserStatus;
  team_id?: string;
}

interface PaginatedUsers {
  data: UserListItem[];
  meta: { page: number; limit: number; total: number };
}

function buildQuery(params: ListUsersParams): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') usp.set(k, String(v));
  }
  const q = usp.toString();
  return q ? `?${q}` : '';
}

export function usersListQueryKey(params: ListUsersParams) {
  return ['users', params] as const;
}

export function useListUsers(params: ListUsersParams) {
  return useQuery({
    queryKey: usersListQueryKey(params),
    queryFn: async (): Promise<PaginatedUsers> => {
      const res = await apiFetch<UserListItem[]>(`/users${buildQuery(params)}`);
      // The API returns its own { data, meta } envelope; apiFetch hands back the whole thing.
      return {
        data: (res.data ?? []) as UserListItem[],
        meta: {
          page: res.meta?.page ?? params.page ?? 1,
          limit: res.meta?.limit ?? params.limit ?? 25,
          total: res.meta?.total ?? 0,
        },
      };
    },
  });
}

export function useGetUser(id: string | undefined) {
  return useQuery({
    queryKey: ['user', id],
    enabled: !!id,
    queryFn: async () => {
      const res = await apiFetch<UserDetail>(`/users/${id}`);
      if (!res.data) throw new Error('User not found');
      return res.data;
    },
  });
}

export function useUserSummary(id: string | undefined) {
  return useQuery({
    queryKey: ['user-summary', id],
    enabled: !!id,
    queryFn: async () => {
      const res = await apiFetch<UserSummary>(`/users/${id}/summary`);
      if (!res.data) throw new Error('Summary not available');
      return res.data;
    },
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateUserRequest): Promise<CreateUserResponse> => {
      const res = await apiFetch<CreateUserResponse>(`/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.data) throw new Error('Create failed');
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateUser(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateUserRequest): Promise<User> => {
      const res = await apiFetch<User>(`/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.data) throw new Error('Update failed');
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['user', id] });
    },
  });
}

export function useInviteUser() {
  return useMutation({
    mutationFn: async (id: string): Promise<InviteUserResponse> => {
      const res = await apiFetch<InviteUserResponse>(`/users/${id}/invite`, { method: 'POST' });
      if (!res.data) throw new Error('Invite failed');
      return res.data;
    },
  });
}

export function useDeactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch<User>(`/users/${id}/deactivate`, { method: 'POST' });
      return res.data;
    },
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['user', id] });
    },
  });
}

'use client';

import type {
  AddTeamMemberRequest,
  CreateTeamRequest,
  Team,
  TeamDetail,
  TeamLeaderboardEntry,
  TeamListItem,
  UpdateTeamRequest,
} from '@dv-wms/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';

export function useListTeams() {
  return useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      const res = await apiFetch<TeamListItem[]>(`/teams`);
      return (res.data ?? []) as TeamListItem[];
    },
  });
}

export function useGetTeam(id: string | undefined) {
  return useQuery({
    queryKey: ['team', id],
    enabled: !!id,
    queryFn: async () => {
      const res = await apiFetch<TeamDetail>(`/teams/${id}`);
      if (!res.data) throw new Error('Team not found');
      return res.data;
    },
  });
}

export function useTeamLeaderboard(id: string | undefined) {
  return useQuery({
    queryKey: ['team-leaderboard', id],
    enabled: !!id,
    queryFn: async () => {
      const res = await apiFetch<TeamLeaderboardEntry[]>(`/teams/${id}/leaderboard`);
      return res.data ?? [];
    },
  });
}

export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateTeamRequest): Promise<Team> => {
      const res = await apiFetch<Team>(`/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.data) throw new Error('Create team failed');
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
  });
}

export function useUpdateTeam(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateTeamRequest): Promise<Team> => {
      const res = await apiFetch<Team>(`/teams/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.data) throw new Error('Update failed');
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams'] });
      qc.invalidateQueries({ queryKey: ['team', id] });
    },
  });
}

export function useAssignLeader(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (user_id: string) => {
      const res = await apiFetch<Team>(`/teams/${id}/leader`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id }),
      });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams'] });
      qc.invalidateQueries({ queryKey: ['team', id] });
    },
  });
}

export function useAddMember(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: AddTeamMemberRequest) => {
      const res = await apiFetch<unknown>(`/teams/${id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team', id] });
      qc.invalidateQueries({ queryKey: ['teams'] });
    },
  });
}

export function useRemoveMember(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiFetch<{ removed: number }>(`/teams/${teamId}/members/${userId}`, {
        method: 'DELETE',
      });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team', teamId] });
      qc.invalidateQueries({ queryKey: ['teams'] });
    },
  });
}

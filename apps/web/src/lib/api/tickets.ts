'use client';

import type {
  AssignTicketRequest,
  CreateTicketRequest,
  SendTicketMessageRequest,
  Ticket,
  TicketDetail,
  TicketListItem,
  TicketMessageWithSender,
  TicketPriority,
  TicketStatus,
  TicketType,
  UpdateTicketStatusRequest,
} from '@dv-wms/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';

export interface ListTicketsParams {
  page?: number;
  limit?: number;
  q?: string;
  status?: TicketStatus;
  type?: TicketType;
  priority?: TicketPriority;
  team_id?: string;
  assigned_to?: string;
  raised_by?: string;
  unattended?: boolean;
  mine?: boolean;
}

interface PaginatedTickets {
  data: TicketListItem[];
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

export function useListTickets(params: ListTicketsParams) {
  return useQuery({
    queryKey: ['tickets', params],
    queryFn: async (): Promise<PaginatedTickets> => {
      const res = await apiFetch<TicketListItem[]>(`/tickets${buildQuery(params)}`);
      return {
        data: (res.data ?? []) as TicketListItem[],
        meta: {
          page: res.meta?.page ?? params.page ?? 1,
          limit: res.meta?.limit ?? params.limit ?? 25,
          total: res.meta?.total ?? 0,
        },
      };
    },
  });
}

export function useGetTicket(id: string | undefined) {
  return useQuery({
    queryKey: ['ticket', id],
    enabled: !!id,
    queryFn: async () => {
      const res = await apiFetch<TicketDetail>(`/tickets/${id}`);
      if (!res.data) throw new Error('Ticket not found');
      return res.data;
    },
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateTicketRequest): Promise<Ticket> => {
      const res = await apiFetch<Ticket>(`/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.data) throw new Error('Create failed');
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tickets'] }),
  });
}

export function useSendTicketMessage(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: SendTicketMessageRequest): Promise<TicketMessageWithSender> => {
      const res = await apiFetch<TicketMessageWithSender>(`/tickets/${id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.data) throw new Error('Send failed');
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket', id] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
}

export function useChangeTicketStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateTicketStatusRequest) => {
      const res = await apiFetch<Ticket>(`/tickets/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket', id] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
}

export function useAssignTicket(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: AssignTicketRequest) => {
      const res = await apiFetch<Ticket>(`/tickets/${id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket', id] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
}

'use client';

import type {
  MarkNotificationReadRequest,
  Notification,
  NotificationsListResponse,
  UnreadCountResponse,
} from '@dv-wms/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';

export interface ListNotificationsParams {
  page?: number;
  limit?: number;
  unread_only?: boolean;
  type?: string;
}

function buildQuery(params: object): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') usp.set(k, String(v));
  }
  const q = usp.toString();
  return q ? `?${q}` : '';
}

export function useListNotifications(params: ListNotificationsParams = {}) {
  return useQuery({
    queryKey: ['notifications', params],
    queryFn: async (): Promise<NotificationsListResponse> => {
      const res = await apiFetch<Notification[]>(`/notifications${buildQuery(params)}`);
      const meta = (res.meta ?? {}) as NotificationsListResponse['meta'];
      return {
        data: (res.data ?? []) as Notification[],
        meta: {
          page: meta.page ?? params.page ?? 1,
          limit: meta.limit ?? params.limit ?? 25,
          total: meta.total ?? 0,
          unread: meta.unread ?? 0,
        },
      };
    },
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: async () => {
      const res = await apiFetch<UnreadCountResponse>(`/notifications/unread-count`);
      return (res.data ?? { unread: 0 }) as UnreadCountResponse;
    },
    refetchInterval: 60_000,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: MarkNotificationReadRequest) => {
      const res = await apiFetch<{ updated: number }>(`/notifications/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    },
  });
}

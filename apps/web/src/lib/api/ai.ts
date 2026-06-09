'use client';

import type { AskQueryRequest, AskQueryResponse } from '@dv-wms/types';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../api-client';

/**
 * Conversational query over DV-WMS data. Stateless on the server — the
 * client sends the full message history each call. Returns 503 if
 * ANTHROPIC_API_KEY isn't configured.
 */
export function useAskQuery() {
  return useMutation({
    mutationFn: async (body: AskQueryRequest): Promise<AskQueryResponse> => {
      const res = await apiFetch<AskQueryResponse>(`/ai/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.data) throw new Error('Query returned no payload');
      return res.data;
    },
  });
}

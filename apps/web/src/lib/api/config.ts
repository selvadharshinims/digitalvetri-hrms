'use client';

import type { ScoringConfig, UpdateScoringConfigRequest } from '@dv-wms/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';

export function useScoringConfig() {
  return useQuery({
    queryKey: ['scoring-config'],
    queryFn: async () => {
      const res = await apiFetch<ScoringConfig>(`/config/scoring`);
      return res.data as ScoringConfig;
    },
  });
}

export function useUpdateScoringConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateScoringConfigRequest) => {
      const res = await apiFetch<ScoringConfig>(`/config/scoring`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scoring-config'] }),
  });
}

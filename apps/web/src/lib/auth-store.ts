'use client';

import { useEffect, useState } from 'react';
import type { SessionUser } from '@dv-wms/types';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  user: SessionUser | null;
  access_token: string | null;
  refresh_token: string | null;
  setSession: (user: SessionUser, access_token: string, refresh_token: string) => void;
  setTokens: (access_token: string, refresh_token: string) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      access_token: null,
      refresh_token: null,
      setSession: (user, access_token, refresh_token) =>
        set({ user, access_token, refresh_token }),
      setTokens: (access_token, refresh_token) => set({ access_token, refresh_token }),
      clear: () => set({ user: null, access_token: null, refresh_token: null }),
    }),
    {
      name: 'dv-wms.session',
      partialize: (s) => ({
        user: s.user,
        access_token: s.access_token,
        refresh_token: s.refresh_token,
      }),
    },
  ),
);

/**
 * Tracks whether the persisted store has finished hydrating from localStorage.
 * Components rendering session-dependent UI should wait for this before redirecting.
 *
 * During SSR/SSG, `persist` is a no-op and `hasHydrated` may not be callable.
 * We default to `false` server-side so layouts render the Loading state and
 * only flip to `true` after the client-side onFinishHydration fires.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const persist = useAuthStore.persist;
    if (!persist) return;
    const unsubFinish = persist.onFinishHydration(() => setHydrated(true));
    const unsubHydrate = persist.onHydrate(() => setHydrated(false));
    setHydrated(persist.hasHydrated());
    return () => {
      unsubFinish();
      unsubHydrate();
    };
  }, []);

  return hydrated;
}

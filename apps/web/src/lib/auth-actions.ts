'use client';

import type { LoginResponse, SessionUser } from '@dv-wms/types';
import { apiFetch } from './api-client';
import { useAuthStore } from './auth-store';

export async function login(email: string, password: string): Promise<SessionUser> {
  const res = await apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const payload = res.data;
  if (!payload) throw new Error('Login response missing data');
  useAuthStore
    .getState()
    .setSession(payload.user, payload.tokens.access_token, payload.tokens.refresh_token);
  return payload.user;
}

export async function logout(): Promise<void> {
  const { refresh_token } = useAuthStore.getState();
  if (refresh_token) {
    await apiFetch<void>('/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token }),
    }).catch(() => {
      // logout is best-effort
    });
  }
  useAuthStore.getState().clear();
}

export async function fetchMe(): Promise<SessionUser> {
  const res = await apiFetch<SessionUser>('/auth/me');
  if (!res.data) throw new Error('Session lookup failed');
  return res.data;
}

export async function setPassword(
  inviteToken: string,
  newPassword: string,
): Promise<SessionUser> {
  const res = await apiFetch<LoginResponse>('/auth/set-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invite_token: inviteToken, new_password: newPassword }),
  });
  const payload = res.data;
  if (!payload) throw new Error('Set-password response missing data');
  useAuthStore
    .getState()
    .setSession(payload.user, payload.tokens.access_token, payload.tokens.refresh_token);
  return payload.user;
}

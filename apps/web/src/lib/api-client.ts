/**
 * Thin fetch wrapper for the DV-WMS API.
 * Reads the bearer token from the zustand auth store and normalizes errors
 * to the shared `ApiError` envelope shape from @dv-wms/types.
 */
import type { ApiEnvelope, ApiError } from '@dv-wms/types';
import { useAuthStore } from './auth-store';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1';

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly error: ApiError,
  ) {
    super(error.message);
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<ApiEnvelope<T>> {
  const token = useAuthStore.getState().access_token;
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  const body = (await res.json().catch(() => ({}))) as ApiEnvelope<T>;

  if (!res.ok) {
    if (res.status === 401) {
      useAuthStore.getState().clear();
    }
    throw new ApiRequestError(
      res.status,
      body.error ?? { code: 'HTTP_ERROR', message: res.statusText },
    );
  }
  return body;
}

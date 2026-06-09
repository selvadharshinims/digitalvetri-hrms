/**
 * Standard API response envelope used by every endpoint.
 * Success: { data, meta }. Error: { error, meta }.
 */
export interface ApiMeta {
  timestamp?: string;
  path?: string;
  method?: string;
  page?: number;
  limit?: number;
  total?: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiEnvelope<T> {
  data?: T;
  error?: ApiError;
  meta?: ApiMeta;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export interface DateRangeQuery {
  from?: string;
  to?: string;
}

/**
 * Injection token for the shared ioredis client.
 *
 * Kept in its own file so `redis.module.ts` and `redis.service.ts` don't form
 * a circular import (module → service → module).
 */
export const REDIS_CLIENT = 'REDIS_CLIENT';

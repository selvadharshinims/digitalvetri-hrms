import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.tokens';

@Injectable()
export class RedisService {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  get raw(): Redis {
    return this.client;
  }

  /** Add a refresh token JTI to the denylist for `ttlSeconds`. */
  async denylistRefresh(jti: string, ttlSeconds: number): Promise<void> {
    await this.client.set(this.key('refresh', jti), '1', 'EX', ttlSeconds);
  }

  async isRefreshDenylisted(jti: string): Promise<boolean> {
    const v = await this.client.get(this.key('refresh', jti));
    return v !== null;
  }

  private key(...parts: string[]): string {
    return ['dvwms', 'denylist', ...parts].join(':');
  }
}

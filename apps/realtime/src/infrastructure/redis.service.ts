import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import Redis from 'ioredis';
import { closeRedisClient } from '../redis-client-lifecycle.js';

const RATE_LIMIT_WINDOW_MILLISECONDS = 60_000;

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client!: Redis;
  private readonly configuredRedisUrl: string | undefined;

  constructor(private readonly config: ConfigService) {
    this.configuredRedisUrl = this.config.get<string>('REDIS_URL');
  }

  isConfigured() {
    return Boolean(this.configuredRedisUrl?.trim());
  }

  hasSharedStore() {
    const explicit = process.env.REDIS_URL?.trim();
    return Boolean(explicit) && explicit !== 'redis://localhost:6379';
  }

  onModuleInit() {
    this.client = new Redis(
      this.configuredRedisUrl ?? 'redis://localhost:6379',
      {
        keepAlive: 30_000,
        lazyConnect: true,
        maxRetriesPerRequest: 3,
      },
    );
    this.client.on('error', (error: Error) => {
      console.error('[Redis] connection error:', error.message);
    });
  }

  async onModuleDestroy() {
    await closeRedisClient(this.client, 'Redis');
  }

  /** Shared connection for feature-specific Redis stores. */
  getClient(): Redis {
    return this.client;
  }

  async consumeRateLimit(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<boolean | null> {
    if (!this.configuredRedisUrl) return null;
    if (
      key.length < 1 ||
      key.length > 256 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 1_000 ||
      windowMs !== RATE_LIMIT_WINDOW_MILLISECONDS
    ) {
      return false;
    }

    const keyHash = createHash('sha256').update(key).digest('hex');
    const redisKey = `rate-limit:${keyHash}`;
    try {
      const count = await this.client.eval(
        `
          local count = redis.call("INCR", KEYS[1])
          if count == 1 then
            redis.call("PEXPIRE", KEYS[1], ARGV[1])
          end
          return count
        `,
        1,
        redisKey,
        windowMs,
      );
      return Number(count) <= limit;
    } catch {
      return false;
    }
  }
}

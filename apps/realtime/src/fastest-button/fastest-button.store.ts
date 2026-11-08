import { Injectable } from '@nestjs/common';
import { RedisService } from '../infrastructure/redis.service.js';
import {
  FASTEST_CAS_SCRIPT,
  FASTEST_PRESS_SCRIPT,
} from './fastest-button.scripts.js';

@Injectable()
export class FastestButtonStore {
  constructor(private readonly redis: RedisService) {}

  async fastestClock(): Promise<number> {
    const [seconds, micros] = await this.redis.getClient().time();
    return Number(seconds) * 1000 + Math.floor(Number(micros) / 1000);
  }

  async loadFastestRoom<T>(code: string): Promise<T | null> {
    const raw = await this.redis.getClient().get(`fastest:room:${code}`);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async compareAndSetFastestRoom(
    code: string,
    revision: number,
    room: unknown,
    ttl: number,
    deadline: number,
  ): Promise<boolean> {
    const result = await this.redis
      .getClient()
      .eval(
        FASTEST_CAS_SCRIPT,
        2,
        `fastest:room:${code}`,
        'fastest:deadlines',
        revision,
        JSON.stringify(room),
        ttl,
        deadline,
        code,
      );
    return Number(result) === 1;
  }

  async pressFastestButton(
    code: string,
    roundId: string,
    playerId: string,
    socketId: string,
    ttl: number,
  ): Promise<string> {
    return String(
      await this.redis
        .getClient()
        .eval(
          FASTEST_PRESS_SCRIPT,
          2,
          `fastest:room:${code}`,
          'fastest:deadlines',
          roundId,
          playerId,
          socketId,
          ttl,
        ),
    );
  }

  async dueFastestRooms(now: number): Promise<string[]> {
    return this.redis
      .getClient()
      .zrangebyscore('fastest:deadlines', 0, now, 'LIMIT', 0, 100);
  }

  async clearFastestDeadline(code: string): Promise<void> {
    await this.redis.getClient().zrem('fastest:deadlines', code);
  }
}

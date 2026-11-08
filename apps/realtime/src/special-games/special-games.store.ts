import { Injectable } from '@nestjs/common';
import { RedisService } from '../infrastructure/redis.service.js';

const GAME_TTL_SECONDS = 3 * 60 * 60;
const SPECIAL_ROOM_LOCK_MILLISECONDS = 10_000;

@Injectable()
export class SpecialGamesStore {
  constructor(private readonly redis: RedisService) {}

  private get client() {
    return this.redis.getClient();
  }

  private specialRoomKey(pin: string) {
    return `special-game:${pin}:room`;
  }

  private specialRoomLockKey(pin: string) {
    return `special-game:${pin}:lock`;
  }

  // ── Special game rooms ───────────────────────────────────────────────────

  async saveSpecialRoom<T>(pin: string, room: T): Promise<void> {
    await this.client.set(
      this.specialRoomKey(pin),
      JSON.stringify(room),
      'EX',
      GAME_TTL_SECONDS,
    );
  }

  async loadSpecialRoom<T>(pin: string): Promise<T | null> {
    const raw = await this.client.get(this.specialRoomKey(pin));
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async deleteSpecialRoom(pin: string): Promise<void> {
    await this.client.del(this.specialRoomKey(pin));
  }

  async acquireSpecialRoomLock(pin: string, token: string): Promise<boolean> {
    const result = await this.client.set(
      this.specialRoomLockKey(pin),
      token,
      'PX',
      SPECIAL_ROOM_LOCK_MILLISECONDS,
      'NX',
    );
    return result === 'OK';
  }

  async releaseSpecialRoomLock(pin: string, token: string): Promise<void> {
    await this.client.eval(
      `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
          return redis.call("DEL", KEYS[1])
        end
        return 0
      `,
      1,
      this.specialRoomLockKey(pin),
      token,
    );
  }

  async addActivePin(pin: string): Promise<void> {
    await this.client.sadd('special-game:pins:active', pin);
    await this.client.expire('special-game:pins:active', GAME_TTL_SECONDS);
  }

  async removeActivePin(pin: string): Promise<void> {
    await this.client.srem('special-game:pins:active', pin);
  }

  async isPinActive(pin: string): Promise<boolean> {
    return (await this.client.sismember('special-game:pins:active', pin)) === 1;
  }
}

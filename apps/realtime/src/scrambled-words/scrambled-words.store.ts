import { Injectable } from '@nestjs/common';
import { RedisService } from '../infrastructure/redis.service.js';

const GAME_TTL_SECONDS = 3 * 60 * 60;
const SPECIAL_ROOM_LOCK_MILLISECONDS = 10_000;

@Injectable()
export class ScrambledWordsStore {
  constructor(private readonly redis: RedisService) {}

  private get client() {
    return this.redis.getClient();
  }

  // ── Scrambled words rooms ────────────────────────────────────────────────

  private scrambledRoomKey(roomCode: string) {
    return `scrambled:room:${roomCode}`;
  }

  private scrambledRoomLockKey(roomCode: string) {
    return `scrambled:room:${roomCode}:lock`;
  }

  async saveScrambledRoom<T>(roomCode: string, room: T): Promise<void> {
    await this.client.set(
      this.scrambledRoomKey(roomCode),
      JSON.stringify(room),
      'EX',
      GAME_TTL_SECONDS,
    );
  }

  async loadScrambledRoom<T>(roomCode: string): Promise<T | null> {
    const raw = await this.client.get(this.scrambledRoomKey(roomCode));
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async deleteScrambledRoom(roomCode: string): Promise<void> {
    await this.client.del(this.scrambledRoomKey(roomCode));
  }

  async addActiveScrambledRoomCode(roomCode: string): Promise<void> {
    await this.client.sadd('scrambled:roomCodes:active', roomCode);
    await this.client.expire('scrambled:roomCodes:active', GAME_TTL_SECONDS);
  }

  async removeActiveScrambledRoomCode(roomCode: string): Promise<void> {
    await this.client.srem('scrambled:roomCodes:active', roomCode);
  }

  async isScrambledRoomCodeActive(roomCode: string): Promise<boolean> {
    return (
      (await this.client.sismember('scrambled:roomCodes:active', roomCode)) ===
      1
    );
  }

  async acquireScrambledRoomLock(
    roomCode: string,
    token: string,
  ): Promise<boolean> {
    const result = await this.client.set(
      this.scrambledRoomLockKey(roomCode),
      token,
      'PX',
      SPECIAL_ROOM_LOCK_MILLISECONDS,
      'NX',
    );
    return result === 'OK';
  }

  async releaseScrambledRoomLock(
    roomCode: string,
    token: string,
  ): Promise<void> {
    await this.client.eval(
      `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
          return redis.call("DEL", KEYS[1])
        end
        return 0
      `,
      1,
      this.scrambledRoomLockKey(roomCode),
      token,
    );
  }

  async setScrambledGuestIdentity(
    guestId: string,
    identity: unknown,
    ttlSeconds: number,
  ): Promise<void> {
    await this.client.set(
      `scrambled:guest:${guestId}`,
      JSON.stringify(identity),
      'EX',
      ttlSeconds,
    );
  }

  async getScrambledGuestIdentity<T>(guestId: string): Promise<T | null> {
    const raw = await this.client.get(`scrambled:guest:${guestId}`);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async deleteScrambledGuestIdentity(guestId: string): Promise<void> {
    await this.client.del(`scrambled:guest:${guestId}`);
  }
}

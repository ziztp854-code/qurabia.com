import { Injectable } from '@nestjs/common';
import { RedisService } from '../infrastructure/redis.service.js';

const GAME_TTL_SECONDS = 3 * 60 * 60;
const SPECIAL_ROOM_LOCK_MILLISECONDS = 10_000;

@Injectable()
export class EliminationStore {
  constructor(private readonly redis: RedisService) {}

  private get client() {
    return this.redis.getClient();
  }

  // ── Elimination royale rooms ─────────────────────────────────────────────

  private eliminationRoomKey(roomCode: string) {
    return `elimination:room:${roomCode}`;
  }

  private eliminationRoomLockKey(roomCode: string) {
    return `elimination:room:${roomCode}:lock`;
  }

  async saveEliminationRoom<T>(roomCode: string, room: T): Promise<void> {
    await this.client.set(
      this.eliminationRoomKey(roomCode),
      JSON.stringify(room),
      'EX',
      GAME_TTL_SECONDS,
    );
  }

  async loadEliminationRoom<T>(roomCode: string): Promise<T | null> {
    const raw = await this.client.get(this.eliminationRoomKey(roomCode));
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async deleteEliminationRoom(roomCode: string): Promise<void> {
    await this.client.del(this.eliminationRoomKey(roomCode));
  }

  async addActiveEliminationRoomCode(roomCode: string): Promise<void> {
    await this.client.sadd('elimination:roomCodes:active', roomCode);
    await this.client.expire('elimination:roomCodes:active', GAME_TTL_SECONDS);
  }

  async removeActiveEliminationRoomCode(roomCode: string): Promise<void> {
    await this.client.srem('elimination:roomCodes:active', roomCode);
  }

  async isEliminationRoomCodeActive(roomCode: string): Promise<boolean> {
    return (
      (await this.client.sismember(
        'elimination:roomCodes:active',
        roomCode,
      )) === 1
    );
  }

  async acquireEliminationRoomLock(
    roomCode: string,
    token: string,
  ): Promise<boolean> {
    const result = await this.client.set(
      this.eliminationRoomLockKey(roomCode),
      token,
      'PX',
      SPECIAL_ROOM_LOCK_MILLISECONDS,
      'NX',
    );
    return result === 'OK';
  }

  async releaseEliminationRoomLock(
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
      this.eliminationRoomLockKey(roomCode),
      token,
    );
  }

  async setEliminationGuestIdentity(
    guestId: string,
    identity: unknown,
    ttlSeconds: number,
  ): Promise<void> {
    await this.client.set(
      `elimination:guest:${guestId}`,
      JSON.stringify(identity),
      'EX',
      ttlSeconds,
    );
  }

  async getEliminationGuestIdentity<T>(guestId: string): Promise<T | null> {
    const raw = await this.client.get(`elimination:guest:${guestId}`);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async deleteEliminationGuestIdentity(guestId: string): Promise<void> {
    await this.client.del(`elimination:guest:${guestId}`);
  }
}

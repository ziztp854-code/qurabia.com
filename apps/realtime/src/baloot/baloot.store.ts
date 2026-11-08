import { Injectable } from '@nestjs/common';
import { RedisService } from '../infrastructure/redis.service.js';

const BALOOT_TTL_SECONDS = 6 * 60 * 60;
const SPECIAL_ROOM_LOCK_MILLISECONDS = 10_000;

@Injectable()
export class BalootStore {
  constructor(private readonly redis: RedisService) {}
  private get client() {
    return this.redis.getClient();
  }
  isConfigured() {
    return this.redis.isConfigured();
  }
  hasSharedStore() {
    return this.redis.hasSharedStore();
  }

  private balootRoomKey(roomCode: string) {
    return `baloot:room:${roomCode}`;
  }

  private balootRoomLockKey(roomCode: string) {
    return `baloot:room:${roomCode}:lock`;
  }

  private balootSessionKey(sessionToken: string) {
    return `baloot:session:${sessionToken}`;
  }

  private balootSocketsKey(roomCode: string) {
    return `baloot:sockets:${roomCode}`;
  }

  // ── Baloot rooms ─────────────────────────────────────────────────────────

  async saveBalootRoom<T>(roomCode: string, room: T): Promise<void> {
    await this.client
      .multi()
      .set(
        this.balootRoomKey(roomCode),
        JSON.stringify(room),
        'EX',
        BALOOT_TTL_SECONDS,
      )
      .sadd('baloot:roomCodes:active', roomCode)
      .expire('baloot:roomCodes:active', BALOOT_TTL_SECONDS)
      .exec();
  }

  async loadBalootRoom<T>(roomCode: string): Promise<T | null> {
    const raw = await this.client.get(this.balootRoomKey(roomCode));
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async deleteBalootRoom(roomCode: string): Promise<void> {
    await this.client
      .multi()
      .del(this.balootRoomKey(roomCode), this.balootSocketsKey(roomCode))
      .srem('baloot:roomCodes:active', roomCode)
      .exec();
  }

  async setBalootSession(
    sessionToken: string,
    roomCode: string,
  ): Promise<void> {
    await this.client.set(
      this.balootSessionKey(sessionToken),
      roomCode,
      'EX',
      BALOOT_TTL_SECONDS,
    );
  }

  async getBalootSession(sessionToken: string): Promise<string | null> {
    return this.client.get(this.balootSessionKey(sessionToken));
  }

  async deleteBalootSession(sessionToken: string): Promise<void> {
    await this.client.del(this.balootSessionKey(sessionToken));
  }

  async addBalootSocket(
    roomCode: string,
    socketId: string,
    sessionToken: string,
  ): Promise<void> {
    const key = this.balootSocketsKey(roomCode);
    await this.client.hset(key, socketId, sessionToken);
    await this.client.expire(key, BALOOT_TTL_SECONDS);
  }

  async removeBalootSocket(roomCode: string, socketId: string): Promise<void> {
    await this.client.hdel(this.balootSocketsKey(roomCode), socketId);
  }

  async listBalootSockets(
    roomCode: string,
  ): Promise<Array<{ socketId: string; sessionToken: string }>> {
    const entries = await this.client.hgetall(this.balootSocketsKey(roomCode));
    return Object.entries(entries).map(([socketId, sessionToken]) => ({
      socketId,
      sessionToken,
    }));
  }

  async acquireBalootRoomLock(
    roomCode: string,
    token: string,
  ): Promise<boolean> {
    const result = await this.client.set(
      this.balootRoomLockKey(roomCode),
      token,
      'PX',
      SPECIAL_ROOM_LOCK_MILLISECONDS,
      'NX',
    );
    return result === 'OK';
  }

  async releaseBalootRoomLock(roomCode: string, token: string): Promise<void> {
    await this.client.eval(
      `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
          return redis.call("DEL", KEYS[1])
        end
        return 0
      `,
      1,
      this.balootRoomLockKey(roomCode),
      token,
    );
  }
}

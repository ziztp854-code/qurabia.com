import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { RedisService } from '../infrastructure/redis.service.js';
const GAME_TTL_SECONDS = 3 * 60 * 60;
const SPECIAL_ROOM_LOCK_MILLISECONDS = 10_000;
@Injectable()
export class ChessStore {
  constructor(private readonly redis: RedisService) {}
  private get client() {
    return this.redis.getClient();
  }
  consumeRateLimit(key: string, limit: number, windowMs: number) {
    return this.redis.consumeRateLimit(key, limit, windowMs);
  }

  private chessRoomLockKey(pin: string) {
    return `chess:room:${pin}:lock`;
  }

  private chessPresenceKey(pin: string, guestId: string) {
    const guestHash = createHash('sha256').update(guestId).digest('hex');
    return `chess:presence:${pin}:${guestHash}`;
  }

  async acquireChessRoomLock(pin: string, token: string): Promise<boolean> {
    const result = await this.client.set(
      this.chessRoomLockKey(pin),
      token,
      'PX',
      SPECIAL_ROOM_LOCK_MILLISECONDS,
      'NX',
    );
    return result === 'OK';
  }

  async releaseChessRoomLock(pin: string, token: string): Promise<void> {
    await this.client.eval(
      `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
          return redis.call("DEL", KEYS[1])
        end
        return 0
      `,
      1,
      this.chessRoomLockKey(pin),
      token,
    );
  }

  // ── Chess rooms ──────────────────────────────────────────────────────────

  async saveChessRoom<T>(pin: string, room: T): Promise<void> {
    await this.client.set(
      `chess:room:${pin}`,
      JSON.stringify(room),
      'EX',
      GAME_TTL_SECONDS,
    );
  }

  async loadChessRoom<T>(pin: string): Promise<T | null> {
    const raw = await this.client.get(`chess:room:${pin}`);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async deleteChessRoom(pin: string): Promise<void> {
    await this.client.del(`chess:room:${pin}`);
  }

  async addActiveChessPin(pin: string): Promise<void> {
    await this.client.sadd('chess:pins:active', pin);
    await this.client.expire('chess:pins:active', GAME_TTL_SECONDS);
  }

  async removeActiveChessPin(pin: string): Promise<void> {
    await this.client.srem('chess:pins:active', pin);
  }

  async isChessPinActive(pin: string): Promise<boolean> {
    return (await this.client.sismember('chess:pins:active', pin)) === 1;
  }

  async setChessGuestIdentity(
    guestId: string,
    identity: unknown,
    ttlSeconds: number,
  ): Promise<void> {
    await this.client.set(
      `chess:guest:${guestId}`,
      JSON.stringify(identity),
      'EX',
      ttlSeconds,
    );
  }

  async getChessGuestIdentity<T>(guestId: string): Promise<T | null> {
    const raw = await this.client.get(`chess:guest:${guestId}`);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async deleteChessGuestIdentity(guestId: string): Promise<void> {
    await this.client.del(`chess:guest:${guestId}`);
  }

  async addChessSeatSocket(
    pin: string,
    guestId: string,
    socketId: string,
  ): Promise<void> {
    const key = this.chessPresenceKey(pin, guestId);
    await this.client.sadd(key, socketId);
    await this.client.expire(key, GAME_TTL_SECONDS);
  }

  async removeChessSeatSocket(
    pin: string,
    guestId: string,
    socketId: string,
  ): Promise<number> {
    const key = this.chessPresenceKey(pin, guestId);
    await this.client.srem(key, socketId);
    return this.client.scard(key);
  }

  async getChessSeatSockets(pin: string, guestId: string): Promise<string[]> {
    return this.client.smembers(this.chessPresenceKey(pin, guestId));
  }
}

import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import Redis from 'ioredis';
import { closeRedisClient } from '../redis-client-lifecycle.js';
import type { LiveGameState } from './types.js';

const GAME_TTL_SECONDS = 3 * 60 * 60;
const BALOOT_TTL_SECONDS = 6 * 60 * 60;
const LADDER_TTL_SECONDS = 3 * 60 * 60;
const LADDER_ROOM_LOCK_MILLISECONDS = 10_000;
const TRANSITION_LOCK_SECONDS = 8;
const SPECIAL_ROOM_LOCK_MILLISECONDS = 10_000;
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

  private stateKey(sessionId: string) {
    return `live:${sessionId}:state`;
  }
  private specialRoomKey(pin: string) {
    return `special-game:${pin}:room`;
  }
  private specialRoomLockKey(pin: string) {
    return `special-game:${pin}:lock`;
  }
  private chessRoomLockKey(pin: string) {
    return `chess:room:${pin}:lock`;
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
  private chessPresenceKey(pin: string, guestId: string) {
    const guestHash = createHash('sha256').update(guestId).digest('hex');
    return `chess:presence:${pin}:${guestHash}`;
  }

  private transitionKey(sessionId: string) {
    return `live:${sessionId}:transition`;
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

  async saveGameState(state: LiveGameState) {
    await this.client.set(
      this.stateKey(state.sessionId),
      JSON.stringify(state),
      'EX',
      GAME_TTL_SECONDS,
    );
  }

  async loadGameState(sessionId: string): Promise<LiveGameState | null> {
    const raw = await this.client.get(this.stateKey(sessionId));
    return raw ? (JSON.parse(raw) as LiveGameState) : null;
  }

  async acquireTransition(sessionId: string) {
    const result = await this.client.set(
      this.transitionKey(sessionId),
      String(Date.now()),
      'EX',
      TRANSITION_LOCK_SECONDS,
      'NX',
    );
    return result === 'OK';
  }

  async releaseTransition(sessionId: string) {
    await this.client.del(this.transitionKey(sessionId));
  }

  async deleteGameState(sessionId: string) {
    await this.client.del(
      this.stateKey(sessionId),
      this.transitionKey(sessionId),
    );
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

  // ── Ladder rooms ─────────────────────────────────────────────────────────

  private ladderRoomKey(roomCode: string) {
    return `ladder:room:${roomCode}`;
  }

  private ladderRoomLockKey(roomCode: string) {
    return `ladder:room:${roomCode}:lock`;
  }

  async saveLadderRoom<T>(roomCode: string, room: T): Promise<void> {
    await this.client.set(
      this.ladderRoomKey(roomCode),
      JSON.stringify(room),
      'EX',
      LADDER_TTL_SECONDS,
    );
  }

  async loadLadderRoom<T>(roomCode: string): Promise<T | null> {
    const raw = await this.client.get(this.ladderRoomKey(roomCode));
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async deleteLadderRoom(roomCode: string): Promise<void> {
    await this.client.del(this.ladderRoomKey(roomCode));
  }

  async addActiveLadderRoomCode(roomCode: string): Promise<void> {
    await this.client.sadd('ladder:roomCodes:active', roomCode);
    await this.client.expire('ladder:roomCodes:active', LADDER_TTL_SECONDS);
  }

  async removeActiveLadderRoomCode(roomCode: string): Promise<void> {
    await this.client.srem('ladder:roomCodes:active', roomCode);
  }

  async isLadderRoomCodeActive(roomCode: string): Promise<boolean> {
    return (
      (await this.client.sismember('ladder:roomCodes:active', roomCode)) === 1
    );
  }

  async acquireLadderRoomLock(
    roomCode: string,
    token: string,
  ): Promise<boolean> {
    const result = await this.client.set(
      this.ladderRoomLockKey(roomCode),
      token,
      'PX',
      LADDER_ROOM_LOCK_MILLISECONDS,
      'NX',
    );
    return result === 'OK';
  }

  async releaseLadderRoomLock(roomCode: string, token: string): Promise<void> {
    await this.client.eval(
      `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
          return redis.call("DEL", KEYS[1])
        end
        return 0
      `,
      1,
      this.ladderRoomLockKey(roomCode),
      token,
    );
  }

  async setLadderGuestIdentity(
    guestId: string,
    identity: unknown,
    ttlSeconds: number,
  ): Promise<void> {
    await this.client.set(
      `ladder:guest:${guestId}`,
      JSON.stringify(identity),
      'EX',
      ttlSeconds,
    );
  }

  async getLadderGuestIdentity<T>(guestId: string): Promise<T | null> {
    const raw = await this.client.get(`ladder:guest:${guestId}`);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async deleteLadderGuestIdentity(guestId: string): Promise<void> {
    await this.client.del(`ladder:guest:${guestId}`);
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

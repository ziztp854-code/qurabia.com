import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { RedisService } from '../infrastructure/redis.service.js';
const LADDER_TTL_SECONDS = 3 * 60 * 60;
const LADDER_ROOM_LOCK_MILLISECONDS = 10_000;
@Injectable()
export class LadderStore {
  constructor(private readonly redis: RedisService) {}
  private get client() {
    return this.redis.getClient();
  }
  consumeRateLimit(key: string, limit: number, windowMs: number) {
    return this.redis.consumeRateLimit(key, limit, windowMs);
  }

  // ── Ladder rooms ─────────────────────────────────────────────────────────

  private ladderRoomKey(roomCode: string) {
    return `ladder:room:${roomCode}`;
  }

  async reserveLadderCompetitionPack(
    hostId: string,
    competitionId: string,
    reservationId: string,
  ): Promise<number | null> {
    const eventHash = createHash('sha256')
      .update(JSON.stringify([hostId, competitionId]))
      .digest('hex');
    const result = await this.client.eval(
      `local existing = redis.call('HGET', KEYS[1], ARGV[1])
       if existing then return tonumber(existing) end
       local count = redis.call('HLEN', KEYS[1])
       if count >= 8 then return -1 end
       redis.call('HSET', KEYS[1], ARGV[1], count)
       redis.call('EXPIRE', KEYS[1], 2592000)
       return count`,
      1,
      `ladder:competition:sets:${eventHash}`,
      reservationId,
    );
    if (result === -1) return null;
    if (typeof result !== 'number' || result < 0 || result > 7)
      throw new Error('Competition allocation failed');
    return result;
  }

  private ladderRoomLockKey(roomCode: string) {
    return `ladder:room:${roomCode}:lock`;
  }

  async saveLadderRoom<T extends object>(
    roomCode: string,
    room: T,
    token?: string,
    guest?: { guestId: string; identity: unknown },
    unbindGuestId?: string,
  ): Promise<number> {
    const result = await this.client.eval(
      `
      if ARGV[1] ~= '' and redis.call('GET', KEYS[2]) ~= ARGV[1] then return 0 end
      if ARGV[5] ~= '' then
        local raw = redis.call('GET', KEYS[4])
        if raw then
          local ok, old = pcall(cjson.decode, raw)
          local incoming = cjson.decode(ARGV[5])
          if not ok then return -1 end
          if (not old.expiresAt or old.expiresAt >= tonumber(ARGV[8])) and
            ((old.roomCode and old.roomCode ~= ARGV[4]) or old.guestToken ~= incoming.guestToken) then return -1 end
        end
      end
      local revision = redis.call('INCR', KEYS[5])
      local separator = string.len(ARGV[2]) > 2 and ',' or ''
      local room = string.sub(ARGV[2], 1, -2) .. separator .. '"revision":' .. revision .. '}'
      redis.call('SET', KEYS[1], room, 'EX', ARGV[3])
      redis.call('SADD', KEYS[3], ARGV[4])
      redis.call('EXPIRE', KEYS[3], ARGV[3])
      if ARGV[5] ~= '' then redis.call('SET', KEYS[4], ARGV[5], 'EX', ARGV[6]) end
      if ARGV[7] == '1' then
        local raw = redis.call('GET', KEYS[4])
        if raw then local ok, old = pcall(cjson.decode, raw); if ok and old.roomCode == ARGV[4] then redis.call('DEL', KEYS[4]) end end
      end
      return revision
    `,
      5,
      this.ladderRoomKey(roomCode),
      this.ladderRoomLockKey(roomCode),
      'ladder:roomCodes:active',
      `ladder:guest:${guest?.guestId ?? unbindGuestId ?? ''}`,
      'ladder:revision:sequence',
      token ?? '',
      JSON.stringify({ ...room, revision: undefined }),
      LADDER_TTL_SECONDS,
      roomCode,
      guest ? JSON.stringify(guest.identity) : '',
      24 * 60 * 60,
      unbindGuestId ? '1' : '0',
      Date.now(),
    );
    if (result === -1) throw new Error('LADDER_GUEST_BOUND');
    if (typeof result !== 'number' || result <= 0)
      throw new Error('LADDER_LOCK_LOST');
    return result;
  }

  async listActiveLadderRoomCodes(
    cursor: string,
  ): Promise<{ cursor: string; codes: string[] }> {
    const [next, codes] = await this.client.sscan(
      'ladder:roomCodes:active',
      cursor,
      'COUNT',
      100,
    );
    return { cursor: next, codes };
  }

  async renewLadderRoomLock(roomCode: string, token: string): Promise<boolean> {
    const result = await this.client.eval(
      `
      if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE', KEYS[1], ARGV[2]) end
      return 0
    `,
      1,
      this.ladderRoomLockKey(roomCode),
      token,
      LADDER_ROOM_LOCK_MILLISECONDS,
    );
    return result === 1;
  }

  async loadLadderRoom<T>(roomCode: string): Promise<T | null> {
    const raw = await this.client.get(this.ladderRoomKey(roomCode));
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async deleteLadderRoom(
    roomCode: string,
    token?: string,
    unbindGuestId?: string,
  ): Promise<void> {
    const result = await this.client.eval(
      `
      if ARGV[1] ~= '' and redis.call('GET', KEYS[2]) ~= ARGV[1] then return 0 end
      redis.call('DEL', KEYS[1])
      redis.call('SREM', KEYS[3], ARGV[2])
      if ARGV[3] == '1' then
        local raw = redis.call('GET', KEYS[4])
        if raw then local ok, old = pcall(cjson.decode, raw); if ok and old.roomCode == ARGV[2] then redis.call('DEL', KEYS[4]) end end
      end
      return 1
    `,
      4,
      this.ladderRoomKey(roomCode),
      this.ladderRoomLockKey(roomCode),
      'ladder:roomCodes:active',
      `ladder:guest:${unbindGuestId ?? ''}`,
      token ?? '',
      roomCode,
      unbindGuestId ? '1' : '0',
    );
    if (result !== 1) throw new Error('LADDER_LOCK_LOST');
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

  async deleteExpiredLadderGuestIdentity(
    guestId: string,
    now: number,
  ): Promise<void> {
    await this.client.eval(
      `
      local raw = redis.call('GET', KEYS[1])
      if not raw then return 0 end
      local ok, identity = pcall(cjson.decode, raw)
      if ok and type(identity.expiresAt) == 'number' and identity.expiresAt < tonumber(ARGV[1]) then
        return redis.call('DEL', KEYS[1])
      end
      return 0
    `,
      1,
      `ladder:guest:${guestId}`,
      now,
    );
  }
}

import { Injectable } from '@nestjs/common';
import {
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import {
  addFastestPlayer,
  cancelFastestRound,
  createFastestRoom,
  FastestRuleError,
  FASTEST_RETENTION_SECONDS,
  resetFastestRoom,
  startFastestRound,
  tickFastestRoom,
  type FastestPlayer,
  type FastestRoom,
  type FastestRound,
  type FastestSettings,
} from '@tahaddi/domain';
import type {
  FastestButtonSnapshot,
  FastestButtonIdentity,
} from '@tahaddi/contracts';
import { RedisService } from '../game/redis.service.js';
const LEASE_MS = 45_000;
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
function arrays(round: FastestRound): FastestRound {
  return {
    ...round,
    presses: Array.isArray(round.presses) ? round.presses : [],
    eligibleIds: Array.isArray(round.eligibleIds) ? round.eligibleIds : [],
    eliminatedIds: Array.isArray(round.eliminatedIds)
      ? round.eliminatedIds
      : [],
    awards: Array.isArray(round.awards) ? round.awards : [],
  };
}
@Injectable()
export class FastestButtonService {
  constructor(private readonly redis: RedisService) {}
  async get(code: string): Promise<FastestRoom | null> {
    const room = await this.redis.loadFastestRoom<FastestRoom>(code);
    if (!room) return null;
    return {
      ...room,
      players: Array.isArray(room.players) ? room.players : [],
      rounds: Array.isArray(room.rounds) ? room.rounds.map(arrays) : [],
      tiebreakIds: Array.isArray(room.tiebreakIds) ? room.tiebreakIds : [],
      round: room.round ? arrays(room.round) : null,
    };
  }
  private deadline(room: FastestRoom): number {
    if (!room.round) return 0;
    if (room.phase === 'countdown') return room.round.startAt;
    if (room.phase === 'active') return room.round.endAt;
    if (
      room.phase === 'results' &&
      !room.rounds.some((r) => r.id === room.round!.id)
    )
      return room.updatedAt;
    return 0;
  }
  async update(
    code: string,
    action: (room: FastestRoom, now: number) => FastestRoom,
  ): Promise<FastestRoom> {
    for (let attempt = 0; attempt < 100; attempt++) {
      const [room, now] = await Promise.all([
        this.get(code),
        this.redis.fastestClock(),
      ]);
      if (!room)
        throw new FastestRuleError(
          'ROOM_NOT_FOUND',
          'الغرفة غير موجودة أو انتهت مدة حفظها.',
        );
      const next = action(room, now);
      if (next === room) return room;
      const saved = { ...next, revision: room.revision + 1, updatedAt: now };
      if (
        await this.redis.compareAndSetFastestRoom(
          code,
          room.revision,
          saved,
          FASTEST_RETENTION_SECONDS,
          this.deadline(saved),
        )
      )
        return saved;
    }
    throw new FastestRuleError('ROOM_BUSY', 'الغرفة مشغولة. أعد المحاولة.');
  }
  async create(
    hostId: string,
    settings: FastestSettings,
  ): Promise<FastestRoom> {
    const now = await this.redis.fastestClock();
    for (let attempt = 0; attempt < 30; attempt++) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const room = createFastestRoom(code, hostId, settings, now);
      if (
        await this.redis.compareAndSetFastestRoom(
          code,
          -1,
          room,
          FASTEST_RETENTION_SECONDS,
          0,
        )
      )
        return room;
    }
    throw new FastestRuleError(
      'CODE_UNAVAILABLE',
      'تعذّر إنشاء رمز فريد؛ أعد المحاولة.',
    );
  }
  async join(
    code: string,
    name: string,
    socketId: string,
  ): Promise<{ room: FastestRoom; identity: FastestButtonIdentity }> {
    const token = randomBytes(32).toString('base64url');
    const playerId = randomUUID();
    const room = await this.update(code, (state, now) =>
      addFastestPlayer(state, {
        id: playerId,
        name: name.trim().replace(/\s+/g, ' '),
        score: 0,
        eliminated: false,
        removed: false,
        tokenHash: hash(token),
        connections: { [socketId]: now + LEASE_MS },
      }),
    );
    return { room, identity: { code, playerId, token } };
  }
  async resume(
    code: string,
    token: string,
    socketId: string,
  ): Promise<{ room: FastestRoom; playerId: string }> {
    const digest = hash(token);
    let playerId = '';
    const room = await this.update(code, (state, now) => {
      const player = state.players.find(
        (p) =>
          p.tokenHash.length === digest.length &&
          timingSafeEqual(Buffer.from(p.tokenHash), Buffer.from(digest)),
      );
      if (!player || player.removed)
        throw new FastestRuleError(
          'INVALID_SESSION',
          'جلسة اللاعب غير صالحة. انضم من جديد.',
        );
      playerId = player.id;
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === player.id
            ? {
                ...p,
                connections: { ...p.connections, [socketId]: now + LEASE_MS },
              }
            : p,
        ),
      };
    });
    return { room, playerId };
  }
  async presence(
    code: string,
    playerId: string,
    socketId: string,
    connected: boolean,
  ): Promise<FastestRoom> {
    return this.update(code, (room, now) => {
      const player = room.players.find((p) => p.id === playerId && !p.removed);
      if (!player) return room;
      const connections = { ...player.connections };
      for (const [id, expiresAt] of Object.entries(connections))
        if (expiresAt <= now) delete connections[id];
      if (connected) connections[socketId] = now + LEASE_MS;
      else delete connections[socketId];
      return {
        ...room,
        players: room.players.map((p) =>
          p.id === playerId ? { ...p, connections } : p,
        ),
      };
    });
  }
  async command(
    code: string,
    hostId: string,
    action: string,
    settings?: FastestSettings,
    playerId?: string,
  ): Promise<FastestRoom> {
    const roundId = randomUUID();
    return this.update(code, (raw, now) => {
      if (raw.hostId !== hostId)
        throw new FastestRuleError('HOST_ONLY', 'هذا الإجراء للمضيف فقط.');
      const room = tickFastestRoom(raw, now);
      if (action === 'start') return startFastestRound(room, roundId, now);
      if (action === 'stop') return cancelFastestRound(room, now);
      if (action === 'reset') return resetFastestRoom(room);
      if (action === 'configure') {
        if (room.phase !== 'lobby' || !settings)
          throw new FastestRuleError(
            'SETTINGS_LOCKED',
            'تُعدّل الإعدادات قبل بدء المنافسة فقط.',
          );
        return { ...room, settings };
      }
      if (action === 'remove') {
        if (
          room.phase !== 'lobby' &&
          !(room.settings.mode === 'classic' && room.phase === 'results')
        )
          throw new FastestRuleError(
            'MATCH_LOCKED',
            'إدارة اللاعبين متاحة قبل المنافسة، أو بين الجولات الكلاسيكية فقط.',
          );
        if (!['lobby', 'results', 'finished'].includes(room.phase))
          throw new FastestRuleError(
            'ROUND_ACTIVE',
            'لا يمكن إزالة لاعب أثناء الجولة.',
          );
        const player = room.players.find(
          (p) => p.id === playerId && !p.removed,
        );
        if (!player)
          throw new FastestRuleError('PLAYER_NOT_FOUND', 'اللاعب غير موجود.');
        if (room.tiebreakIds.includes(player.id))
          throw new FastestRuleError(
            'TIEBREAK_LOCKED',
            'لا يمكن إزالة لاعب في الجولة الفاصلة. أعد ضبط المنافسة أولًا.',
          );
        return {
          ...room,
          players: room.players.map((p) =>
            p.id === playerId ? { ...p, removed: true, connections: {} } : p,
          ),
        };
      }
      throw new FastestRuleError('INVALID_ACTION', 'إجراء غير صالح.');
    });
  }
  async press(
    code: string,
    roundId: string,
    playerId: string,
    socketId: string,
  ): Promise<FastestRoom> {
    const result = await this.redis.pressFastestButton(
      code,
      roundId,
      playerId,
      socketId,
      FASTEST_RETENTION_SECONDS,
    );
    if (result !== 'OK')
      throw new FastestRuleError(
        result,
        result === 'TOO_EARLY'
          ? 'انتظر إشارة البداية. الضغطة المبكرة لا تُحتسب.'
          : result === 'ALREADY_PRESSED'
            ? 'سُجلت ضغطتك بالفعل.'
            : 'لم تُقبل الضغطة: انتهت الجولة أو تغيرت أهلية اللاعب.',
      );
    return this.update(code, (state, now) => tickFastestRoom(state, now));
  }
  async dueRooms(): Promise<string[]> {
    return this.redis.dueFastestRooms(await this.redis.fastestClock());
  }
  async tick(code: string): Promise<FastestRoom | null> {
    if (!(await this.get(code))) {
      await this.redis.clearFastestDeadline(code);
      return null;
    }
    return this.update(code, (room, now) => tickFastestRoom(room, now));
  }
  snapshot(room: FastestRoom, now: number): FastestButtonSnapshot {
    return {
      code: room.code,
      revision: room.revision,
      serverNow: now,
      settings: room.settings,
      phase: room.phase,
      players: room.players.map((p: FastestPlayer) => ({
        id: p.id,
        name: p.name,
        score: p.score,
        eliminated: p.eliminated,
        removed: p.removed,
        connected: Object.values(p.connections).some(
          (expires) => expires > now,
        ),
      })),
      round: room.round,
      rounds: room.rounds.slice(-10),
      championId: room.championId,
      tiebreakIds: room.tiebreakIds,
      regularCompleted: room.regularCompleted,
      notice: room.notice,
    };
  }
  clock(): Promise<number> {
    return this.redis.fastestClock();
  }
}

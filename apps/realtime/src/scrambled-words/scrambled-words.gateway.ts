import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import type { Server, Socket } from 'socket.io';
import { createHash } from 'node:crypto';
import { verifyScrambledWordsHostAccessToken } from '@tahaddi/contracts';
import {
  allowWebSocketOrigin,
  allowWebSocketRequest,
} from '../config/web-origins.js';
import { resolveTokenSecret } from '../config/token-secret.js';
import { SocketEventRateLimiter } from '../special-games/socket-event-rate-limiter.js';
import { RedisService } from '../game/redis.service.js';
import { ScrambledWordsService } from './scrambled-words.service.js';
import {
  createScrambledWordsRoomPayloadSchema,
  joinScrambledWordsRoomPayloadSchema,
  scrambledWordsRoomCodePayloadSchema,
  scrambledWordsWordSubmitPayloadSchema,
} from './scrambled-words.types.js';
import type {
  ClientToServerScrambledWordsEvents,
  ScrambledWordsRoomRuntime,
  ServerToClientScrambledWordsEvents,
} from './scrambled-words.types.js';

type ScrambledSocket = Socket<
  ClientToServerScrambledWordsEvents,
  ServerToClientScrambledWordsEvents
>;
type ScrambledServer = Server<
  ClientToServerScrambledWordsEvents,
  ServerToClientScrambledWordsEvents
>;

type ScrambledRateLimitEvent =
  | 'host'
  | 'join'
  | 'start'
  | 'word'
  | 'next'
  | 'roundEnd'
  | 'gameFinish'
  | 'reconnect'
  | 'leave'
  | 'sync';

const SCRAMBLED_RATE_LIMITS: Record<
  ScrambledRateLimitEvent,
  { socket: number; subject: number; distributed: number }
> = {
  host: { socket: 3, subject: 30, distributed: 30 },
  join: { socket: 10, subject: 100, distributed: 100 },
  start: { socket: 10, subject: 30, distributed: 30 },
  word: { socket: 180, subject: 300, distributed: 300 },
  next: { socket: 10, subject: 30, distributed: 30 },
  roundEnd: { socket: 10, subject: 30, distributed: 30 },
  gameFinish: { socket: 10, subject: 30, distributed: 30 },
  reconnect: { socket: 10, subject: 30, distributed: 30 },
  leave: { socket: 20, subject: 60, distributed: 60 },
  sync: { socket: 80, subject: 240, distributed: 240 },
};

@WebSocketGateway({
  cors: { origin: allowWebSocketOrigin, credentials: true },
  allowRequest: allowWebSocketRequest,
  namespace: '/scrambled-words',
})
export class ScrambledWordsGateway
  implements
    OnGatewayInit<ScrambledServer>,
    OnGatewayDisconnect<ScrambledSocket>
{
  @WebSocketServer()
  server!: ScrambledServer;

  private readonly socketRooms = new Map<string, string>();
  private readonly socketGuestIds = new Map<string, string>();
  private readonly socketHostIds = new Map<string, string>();
  private readonly roundDeadlineTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private readonly rateLimiter = new SocketEventRateLimiter();

  constructor(
    private readonly scrambledWords: ScrambledWordsService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  afterInit() {
    // no-op
  }

  handleDisconnect(client: ScrambledSocket) {
    this.rateLimiter.clearSocket(client.id);
    this.socketRooms.delete(client.id);
    this.socketGuestIds.delete(client.id);
    this.socketHostIds.delete(client.id);
  }

  private emitError(client: ScrambledSocket, code: string, message: string) {
    client.emit('scrambled:error', { code, message });
  }

  private clearRoundDeadline(roomCode: string) {
    const timer = this.roundDeadlineTimers.get(roomCode);
    if (timer) clearTimeout(timer);
    this.roundDeadlineTimers.delete(roomCode);
  }

  private scheduleRoundDeadline(room: ScrambledWordsRoomRuntime) {
    this.clearRoundDeadline(room.roomCode);
    if (
      room.status !== 'active' ||
      room.puzzleDeadlineAt == null ||
      room.currentRound === 0
    ) {
      return;
    }

    const roundNumber = room.currentRound;
    const delay = Math.max(0, room.puzzleDeadlineAt - Date.now()) + 5;
    const timer = setTimeout(() => {
      void this.handleRoundDeadline(room.roomCode, roundNumber);
    }, delay);
    timer.unref?.();
    this.roundDeadlineTimers.set(room.roomCode, timer);
  }

  private async handleRoundDeadline(roomCode: string, roundNumber: number) {
    this.roundDeadlineTimers.delete(roomCode);
    const result = await this.scrambledWords.expireRound(roomCode, roundNumber);
    if (!result.ok) {
      if (result.code === 'ROUND_NOT_EXPIRED') {
        const room = await this.scrambledWords.getRoom(roomCode);
        if (room) this.scheduleRoundDeadline(room);
      }
      return;
    }
    this.publishRoomState(result.room);
  }

  private async refreshExpiredRound(
    room: ScrambledWordsRoomRuntime,
  ): Promise<ScrambledWordsRoomRuntime> {
    if (
      room.status !== 'active' ||
      room.puzzleDeadlineAt == null ||
      Date.now() < room.puzzleDeadlineAt
    ) {
      return room;
    }
    const result = await this.scrambledWords.expireRound(
      room.roomCode,
      room.currentRound,
    );
    return result.ok ? result.room : room;
  }

  private publishRoomState(room: ScrambledWordsRoomRuntime) {
    this.emitPerClientSnapshots(room.roomCode, room);
    if (room.stopReason) {
      this.server.to(room.roomCode).emit('scrambled:error', room.stopReason);
    }
    if (room.status === 'finished') {
      this.clearRoundDeadline(room.roomCode);
      this.server.to(room.roomCode).emit('scrambled:game:ended', {
        results: room.lastRoundResults,
        durationMs: room.endedAt
          ? room.endedAt - (room.startedAt ?? room.endedAt)
          : 0,
      });
      return;
    }
    if (room.status === 'waiting' && room.currentRound > 0) {
      this.server.to(room.roomCode).emit('scrambled:round:ended', {
        roundNumber: room.currentRound,
        words: room.lastRoundWords,
        results: room.lastRoundResults,
      });
    }
    this.scheduleRoundDeadline(room);
  }

  private async attachClientToRoom(
    client: ScrambledSocket,
    roomCode: string,
    guestId?: string,
    hostId?: string,
  ) {
    try {
      await client.join(roomCode);
      if (guestId) {
        this.socketGuestIds.set(client.id, guestId);
      }
      if (hostId) {
        this.socketHostIds.set(client.id, hostId);
      }
      this.socketRooms.set(client.id, roomCode);
      return true;
    } catch {
      try {
        await client.leave(roomCode);
      } catch {
        // best-effort cleanup
      }
      this.socketRooms.delete(client.id);
      this.socketGuestIds.delete(client.id);
      this.socketHostIds.delete(client.id);
      this.emitError(
        client,
        'ROOM_SYNC_FAILED',
        'تعذّر تجهيز اتصال الغرفة. حاول مرة أخرى.',
      );
      return false;
    }
  }

  private rateLimitSubject(client: ScrambledSocket) {
    const address = client.handshake.address?.trim();
    const boundedSubject =
      address && address.length <= 128
        ? `address:${address}`
        : `guest:${this.resolveGuestId(client).slice(0, 128) || 'unknown'}`;
    return createHash('sha256').update(boundedSubject).digest('hex');
  }

  private async canHandleEvent(
    client: ScrambledSocket,
    event: ScrambledRateLimitEvent,
  ) {
    const limits = SCRAMBLED_RATE_LIMITS[event];
    const socketAllowed = this.rateLimiter.consume(
      `socket:${client.id}:scrambled-${event}`,
      limits.socket,
      60_000,
    );
    if (!socketAllowed) return false;

    const subject = this.rateLimitSubject(client);
    const subjectAllowed = this.rateLimiter.consume(
      `subject:${subject}:scrambled-${event}`,
      limits.subject,
      60_000,
    );
    if (!subjectAllowed) return false;

    try {
      const distributedAllowed = await this.redis.consumeRateLimit(
        `scrambled:${event}:${subject}`,
        limits.distributed,
        60_000,
      );
      return distributedAllowed !== false;
    } catch {
      return false;
    }
  }

  private rejectRateLimited(client: ScrambledSocket) {
    return this.emitError(
      client,
      'RATE_LIMITED',
      'تم إرسال طلبات كثيرة خلال وقت قصير. انتظر دقيقة ثم حاول مجددًا.',
    );
  }

  private resolveGuestId(client: ScrambledSocket): string {
    return (this.socketGuestIds.get(client.id) ??
      client.handshake.auth?.guestId ??
      '') as string;
  }

  private resolveAuthenticatedHostId(client: ScrambledSocket): string {
    const hostId =
      typeof client.handshake.auth?.hostId === 'string'
        ? client.handshake.auth.hostId.trim()
        : '';
    const hostAccessToken =
      typeof client.handshake.auth?.hostAccessToken === 'string'
        ? client.handshake.auth.hostAccessToken
        : '';
    const secret = resolveTokenSecret(this.config);
    const payload = verifyScrambledWordsHostAccessToken(
      secret,
      hostAccessToken,
    );
    if (!payload || payload.hostId !== hostId) return '';
    this.socketHostIds.set(client.id, hostId);
    return hostId;
  }

  private emitPerClientSnapshots(
    roomCode: string,
    room: ScrambledWordsRoomRuntime,
  ) {
    const emittedSocketIds = new Set<string>();
    const emitToSocket = (
      socketId: string,
      guestId?: string,
      hostId?: string,
    ) => {
      if (emittedSocketIds.has(socketId)) return;
      emittedSocketIds.add(socketId);
      this.server
        .to(socketId)
        .emit(
          'scrambled:room:state',
          this.scrambledWords.buildSnapshot(
            room,
            guestId ?? null,
            hostId ?? null,
          ),
        );
    };

    for (const player of room.players) {
      emitToSocket(player.id, player.id);
    }

    for (const [socketId, roomPin] of this.socketRooms.entries()) {
      if (roomPin !== roomCode) continue;
      const guestId = this.socketGuestIds.get(socketId);
      const hostId = this.socketHostIds.get(socketId);
      emitToSocket(socketId, guestId, hostId);
    }
  }

  @SubscribeMessage('scrambled:host')
  async hostRoom(
    @ConnectedSocket() client: ScrambledSocket,
    @MessageBody()
    payload: {
      totalRounds?: number;
      roundTimeLimit?: number;
      firstFinish?: boolean;
    },
  ) {
    if (!(await this.canHandleEvent(client, 'host'))) {
      return this.rejectRateLimited(client);
    }
    const hostId = this.resolveAuthenticatedHostId(client);
    if (!hostId) {
      return this.emitError(
        client,
        'HOST_AUTH_REQUIRED',
        'سجّل دخولك من بوابة المضيف لإنشاء غرفة كلمات مفككة.',
      );
    }
    const parsed = createScrambledWordsRoomPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return this.emitError(
        client,
        'INVALID_SETTINGS',
        'إعدادات اللعبة غير صالحة.',
      );
    }

    const result = await this.scrambledWords.createRoom(parsed.data, hostId);
    if (!result.ok) {
      return this.emitError(client, result.code, result.message);
    }
    const room = result.room;
    if (
      !(await this.attachClientToRoom(client, room.roomCode, undefined, hostId))
    ) {
      return;
    }
    this.emitPerClientSnapshots(room.roomCode, room);
  }

  @SubscribeMessage('scrambled:join')
  async joinRoom(
    @ConnectedSocket() client: ScrambledSocket,
    @MessageBody()
    payload: { roomCode?: string; playerName?: string },
  ) {
    if (!(await this.canHandleEvent(client, 'join'))) {
      return this.rejectRateLimited(client);
    }
    const guestId = (client.handshake.auth?.guestId ?? '') as string;
    const guestToken = (client.handshake.auth?.guestToken ?? '') as string;
    const parsed = joinScrambledWordsRoomPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return this.emitError(
        client,
        'INVALID_JOIN',
        'أدخل رمز غرفة صحيحًا واسمًا بين حرفين و30 حرفًا.',
      );
    }

    const identity = await this.scrambledWords.validateGuest(
      guestId,
      guestToken,
    );
    if (!identity) {
      return this.emitError(
        client,
        'INVALID_GUEST',
        'هوية الضيف غير صالحة أو منتهية.',
      );
    }

    const result = await this.scrambledWords.joinRoom(
      parsed.data,
      guestId,
      guestToken,
    );
    if (!result.ok) {
      return this.emitError(client, result.code, result.message);
    }
    const room = result.room;
    if (!(await this.attachClientToRoom(client, room.roomCode, guestId))) {
      return;
    }
    this.emitPerClientSnapshots(room.roomCode, room);
  }

  @SubscribeMessage('scrambled:start')
  async startGame(
    @ConnectedSocket() client: ScrambledSocket,
    @MessageBody() payload: { roomCode?: string },
  ) {
    if (!(await this.canHandleEvent(client, 'start'))) {
      return this.rejectRateLimited(client);
    }
    const hostId = this.resolveAuthenticatedHostId(client);
    const parsed = scrambledWordsRoomCodePayloadSchema.safeParse({
      roomCode:
        typeof payload?.roomCode === 'string' ? payload.roomCode.trim() : '',
    });
    if (!hostId || !parsed.success) {
      return this.emitError(
        client,
        'NOT_HOST',
        'المضيف الموثّق وحده يستطيع بدء اللعبة.',
      );
    }

    const result = await this.scrambledWords.startGame(
      parsed.data.roomCode,
      hostId,
    );
    if (!result.ok) {
      return this.emitError(client, result.code, result.message);
    }
    this.publishRoomState(result.room);
    this.server
      .to(result.room.roomCode)
      .emit('scrambled:countdown', { remaining: 3 });
  }

  @SubscribeMessage('scrambled:word:submit')
  async submitWord(
    @ConnectedSocket() client: ScrambledSocket,
    @MessageBody()
    payload: {
      roomCode?: string;
      puzzleId?: string;
      word?: string;
      submissionId?: string;
    },
  ) {
    if (!(await this.canHandleEvent(client, 'word'))) {
      return this.rejectRateLimited(client);
    }
    const guestId = this.resolveGuestId(client);
    const parsed = scrambledWordsWordSubmitPayloadSchema.safeParse(payload);
    if (!guestId || !parsed.success) {
      return this.emitError(client, 'INVALID_SUBMISSION', 'إرسال غير صالح.');
    }
    const { roomCode, puzzleId, word, submissionId } = parsed.data;

    const result = await this.scrambledWords.submitWord(
      guestId,
      roomCode,
      puzzleId,
      word,
      submissionId,
    );
    if (!result.ok) {
      if (result.submissionId) {
        client.emit('scrambled:word:rejected', {
          submissionId: result.submissionId,
          code: result.code,
          message: result.message,
        });
      }
      return this.emitError(client, result.code, result.message);
    }

    client.emit('scrambled:word:accepted', result.accepted);
    this.publishRoomState(result.room);
  }

  @SubscribeMessage('scrambled:next')
  async nextRound(
    @ConnectedSocket() client: ScrambledSocket,
    @MessageBody() payload: { roomCode?: string },
  ) {
    if (!(await this.canHandleEvent(client, 'next'))) {
      return this.rejectRateLimited(client);
    }
    const hostId = this.resolveAuthenticatedHostId(client);
    const parsed = scrambledWordsRoomCodePayloadSchema.safeParse({
      roomCode:
        typeof payload?.roomCode === 'string' ? payload.roomCode.trim() : '',
    });
    if (!hostId || !parsed.success) {
      return this.emitError(
        client,
        'NOT_HOST',
        'المضيف الموثّق وحده يستطيع بدء جولة.',
      );
    }

    const result = await this.scrambledWords.nextRound(
      parsed.data.roomCode,
      hostId,
    );
    if (!result.ok) {
      return this.emitError(client, result.code, result.message);
    }
    this.publishRoomState(result.room);
    if (result.room.status === 'active') {
      this.server
        .to(result.room.roomCode)
        .emit('scrambled:countdown', { remaining: 3 });
    }
  }

  @SubscribeMessage('scrambled:round:end')
  async endRound(
    @ConnectedSocket() client: ScrambledSocket,
    @MessageBody() payload: { roomCode?: string },
  ) {
    if (!(await this.canHandleEvent(client, 'roundEnd'))) {
      return this.rejectRateLimited(client);
    }
    const hostId = this.resolveAuthenticatedHostId(client);
    const parsed = scrambledWordsRoomCodePayloadSchema.safeParse({
      roomCode:
        typeof payload?.roomCode === 'string' ? payload.roomCode.trim() : '',
    });
    if (!hostId || !parsed.success) {
      return this.emitError(
        client,
        'NOT_HOST',
        'المضيف الموثّق وحده يستطيع إنهاء الجولة.',
      );
    }

    const result = await this.scrambledWords.endRound(
      parsed.data.roomCode,
      hostId,
    );
    if (!result.ok) {
      return this.emitError(client, result.code, result.message);
    }
    this.publishRoomState(result.room);
  }

  @SubscribeMessage('scrambled:game:finish')
  async finishGame(
    @ConnectedSocket() client: ScrambledSocket,
    @MessageBody() payload: { roomCode?: string },
  ) {
    if (!(await this.canHandleEvent(client, 'gameFinish'))) {
      return this.rejectRateLimited(client);
    }
    const hostId = this.resolveAuthenticatedHostId(client);
    const parsed = scrambledWordsRoomCodePayloadSchema.safeParse({
      roomCode:
        typeof payload?.roomCode === 'string' ? payload.roomCode.trim() : '',
    });
    if (!hostId || !parsed.success) {
      return this.emitError(
        client,
        'NOT_HOST',
        'المضيف الموثّق وحده يستطيع إنهاء اللعبة.',
      );
    }

    const result = await this.scrambledWords.finishGame(
      parsed.data.roomCode,
      hostId,
    );
    if (!result.ok) {
      return this.emitError(client, result.code, result.message);
    }
    this.publishRoomState(result.room);
  }

  @SubscribeMessage('scrambled:leave')
  async leaveRoom(
    @ConnectedSocket() client: ScrambledSocket,
    @MessageBody() payload: { roomCode?: string },
  ) {
    const hostId = this.resolveAuthenticatedHostId(client);
    const guestId = this.resolveGuestId(client);
    const roomCode =
      typeof payload?.roomCode === 'string'
        ? payload.roomCode.trim().toUpperCase()
        : (this.socketRooms.get(client.id) ?? '');
    if (!roomCode) return;

    if (hostId) {
      await client.leave(roomCode);
      this.socketRooms.delete(client.id);
      this.socketHostIds.delete(client.id);
      return;
    }
    if (!guestId) return;

    const result = await this.scrambledWords.leaveRoom(guestId, roomCode);
    if (!result.ok) {
      this.clearRoundDeadline(roomCode);
      await client.leave(roomCode);
      this.socketRooms.delete(client.id);
      this.socketGuestIds.delete(client.id);
      this.socketHostIds.delete(client.id);
      if (result.code === 'HOST_LEFT') {
        this.server.to(roomCode).emit('scrambled:error', {
          code: 'HOST_LEFT',
          message: result.message,
        });
        return;
      }
      return this.emitError(client, result.code, result.message);
    }
    this.clearRoundDeadline(roomCode);
    await client.leave(roomCode);
    this.socketRooms.delete(client.id);
    this.socketGuestIds.delete(client.id);
    this.socketHostIds.delete(client.id);
    this.emitPerClientSnapshots(roomCode, result.room);
  }

  @SubscribeMessage('scrambled:reconnect')
  async reconnect(
    @ConnectedSocket() client: ScrambledSocket,
    @MessageBody() payload: { roomCode?: string },
  ) {
    if (!(await this.canHandleEvent(client, 'reconnect'))) {
      return this.rejectRateLimited(client);
    }
    const hostId = this.resolveAuthenticatedHostId(client);
    const guestId = (client.handshake.auth?.guestId ?? '') as string;
    const guestToken = (client.handshake.auth?.guestToken ?? '') as string;
    const parsed = scrambledWordsRoomCodePayloadSchema.safeParse({
      roomCode:
        typeof payload?.roomCode === 'string' ? payload.roomCode.trim() : '',
    });
    if (!parsed.success) {
      return this.emitError(client, 'INVALID_GUEST', 'اتصال غير مصرح به.');
    }
    const roomCode = parsed.data.roomCode;

    if (hostId) {
      const room = await this.scrambledWords.getRoom(roomCode);
      if (!room) {
        return this.emitError(client, 'ROOM_NOT_FOUND', 'الغرفة غير موجودة.');
      }
      if (room.hostId !== hostId) {
        return this.emitError(
          client,
          'NOT_HOST',
          'لا تملك صلاحية إدارة هذه الغرفة.',
        );
      }
      const refreshed = await this.refreshExpiredRound(room);
      if (
        !(await this.attachClientToRoom(client, roomCode, undefined, hostId))
      ) {
        return;
      }
      this.publishRoomState(refreshed);
      return;
    }

    if (!guestId || !guestToken) {
      return this.emitError(client, 'INVALID_GUEST', 'اتصال غير مصرح به.');
    }

    const identity = await this.scrambledWords.validateGuest(
      guestId,
      guestToken,
    );
    if (!identity) {
      return this.emitError(
        client,
        'INVALID_GUEST',
        'هوية الضيف غير صالحة أو منتهية.',
      );
    }

    const result = await this.scrambledWords.handleReconnect(guestId, roomCode);
    if (!result.ok) {
      return this.emitError(client, result.code, result.message);
    }
    const room = await this.refreshExpiredRound(result.room);
    if (!(await this.attachClientToRoom(client, roomCode, guestId))) return;
    this.publishRoomState(room);
  }

  @SubscribeMessage('scrambled:sync')
  async syncRoom(
    @ConnectedSocket() client: ScrambledSocket,
    @MessageBody() payload: { roomCode?: string },
  ) {
    if (!(await this.canHandleEvent(client, 'sync'))) {
      return this.rejectRateLimited(client);
    }
    const roomCode =
      typeof payload?.roomCode === 'string'
        ? payload.roomCode.trim().toUpperCase()
        : (this.socketRooms.get(client.id) ?? '');
    if (!roomCode) return;
    const storedRoom = await this.scrambledWords.getRoom(roomCode);
    if (!storedRoom) {
      return this.emitError(client, 'ROOM_NOT_FOUND', 'الغرفة غير موجودة.');
    }
    const room = await this.refreshExpiredRound(storedRoom);
    if (room !== storedRoom) {
      this.publishRoomState(room);
      return;
    }
    const guestId = this.resolveGuestId(client);
    const hostId = this.socketHostIds.get(client.id);
    client.emit(
      'scrambled:room:state',
      this.scrambledWords.buildSnapshot(room, guestId || null, hostId || null),
    );
    this.scheduleRoundDeadline(room);
  }
}

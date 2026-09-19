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
import { verifyEliminationHostAccessToken } from '@tahaddi/contracts';
import {
  allowWebSocketOrigin,
  allowWebSocketRequest,
} from '../config/web-origins.js';
import { resolveTokenSecret } from '../config/token-secret.js';
import { SocketEventRateLimiter } from '../special-games/socket-event-rate-limiter.js';
import { RedisService } from '../game/redis.service.js';
import { EliminationService } from './elimination.service.js';
import {
  createEliminationRoomPayloadSchema,
  eliminationAnswerSubmitPayloadSchema,
  eliminationRoomCodePayloadSchema,
  joinEliminationRoomPayloadSchema,
} from './elimination.types.js';
import type {
  ClientToServerEliminationEvents,
  EliminationRoomRuntime,
  ServerToClientEliminationEvents,
} from './elimination.types.js';

type EliminationSocket = Socket<
  ClientToServerEliminationEvents,
  ServerToClientEliminationEvents
>;
type EliminationServer = Server<
  ClientToServerEliminationEvents,
  ServerToClientEliminationEvents
>;

type EliminationRateLimitEvent =
  | 'host'
  | 'join'
  | 'start'
  | 'answer'
  | 'next'
  | 'roundEnd'
  | 'gameFinish'
  | 'reconnect'
  | 'leave'
  | 'sync';

const ELIMINATION_RATE_LIMITS: Record<
  EliminationRateLimitEvent,
  { socket: number; subject: number; distributed: number }
> = {
  host: { socket: 3, subject: 30, distributed: 30 },
  join: { socket: 10, subject: 100, distributed: 100 },
  start: { socket: 10, subject: 30, distributed: 30 },
  answer: { socket: 60, subject: 120, distributed: 120 },
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
  namespace: '/elimination',
})
export class EliminationGateway
  implements
    OnGatewayInit<EliminationServer>,
    OnGatewayDisconnect<EliminationSocket>
{
  @WebSocketServer()
  server!: EliminationServer;

  private readonly socketRooms = new Map<string, string>();
  private readonly socketGuestIds = new Map<string, string>();
  private readonly socketHostIds = new Map<string, string>();
  private readonly roundDeadlineTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private readonly rateLimiter = new SocketEventRateLimiter();

  constructor(
    private readonly elimination: EliminationService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  afterInit() {
    // no-op
  }

  handleDisconnect(client: EliminationSocket) {
    this.rateLimiter.clearSocket(client.id);
    this.socketRooms.delete(client.id);
    this.socketGuestIds.delete(client.id);
    this.socketHostIds.delete(client.id);
  }

  private emitError(client: EliminationSocket, code: string, message: string) {
    client.emit('elimination:error', { code, message });
  }

  private clearRoundDeadline(roomCode: string) {
    const timer = this.roundDeadlineTimers.get(roomCode);
    if (timer) clearTimeout(timer);
    this.roundDeadlineTimers.delete(roomCode);
  }

  private scheduleRoundDeadline(room: EliminationRoomRuntime) {
    this.clearRoundDeadline(room.roomCode);
    if (
      room.status !== 'active' ||
      room.questionDeadlineAt == null ||
      room.currentRound === 0
    ) {
      return;
    }

    const roundNumber = room.currentRound;
    const delay = Math.max(0, room.questionDeadlineAt - Date.now()) + 5;
    const timer = setTimeout(() => {
      void this.handleRoundDeadline(room.roomCode, roundNumber);
    }, delay);
    timer.unref?.();
    this.roundDeadlineTimers.set(room.roomCode, timer);
  }

  private async handleRoundDeadline(roomCode: string, roundNumber: number) {
    this.roundDeadlineTimers.delete(roomCode);
    const result = await this.elimination.expireRound(roomCode, roundNumber);
    if (!result.ok) {
      if (result.code === 'ROUND_NOT_EXPIRED') {
        const room = await this.elimination.getRoom(roomCode);
        if (room) this.scheduleRoundDeadline(room);
      }
      return;
    }
    this.publishRoomState(result.room);
  }

  private async refreshExpiredRound(
    room: EliminationRoomRuntime,
  ): Promise<EliminationRoomRuntime> {
    if (
      room.status !== 'active' ||
      room.questionDeadlineAt == null ||
      Date.now() < room.questionDeadlineAt
    ) {
      return room;
    }
    const result = await this.elimination.expireRound(
      room.roomCode,
      room.currentRound,
    );
    return result.ok ? result.room : room;
  }

  private publishRoomState(room: EliminationRoomRuntime) {
    this.emitPerClientSnapshots(room.roomCode, room);
    if (room.stopReason) {
      this.server.to(room.roomCode).emit('elimination:error', room.stopReason);
    }
    if (room.status === 'finished') {
      this.clearRoundDeadline(room.roomCode);
      const champions = this.elimination.resolveChampions(room);
      this.server.to(room.roomCode).emit('elimination:game:ended', {
        ...champions,
        totalRounds: room.currentRound,
        durationMs: room.endedAt
          ? room.endedAt - (room.startedAt ?? room.endedAt)
          : 0,
      });
      return;
    }
    if (room.status === 'between' && room.lastRoundResult) {
      this.server
        .to(room.roomCode)
        .emit('elimination:round:ended', { result: room.lastRoundResult });
    }
    this.scheduleRoundDeadline(room);
  }

  private async attachClientToRoom(
    client: EliminationSocket,
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
        'تعذّر تجهيز اتصال الحلقة. حاول مرة أخرى.',
      );
      return false;
    }
  }

  private rateLimitSubject(client: EliminationSocket) {
    const address = client.handshake.address?.trim();
    const boundedSubject =
      address && address.length <= 128
        ? `address:${address}`
        : `guest:${this.resolveGuestId(client).slice(0, 128) || 'unknown'}`;
    return createHash('sha256').update(boundedSubject).digest('hex');
  }

  private async canHandleEvent(
    client: EliminationSocket,
    event: EliminationRateLimitEvent,
  ) {
    const limits = ELIMINATION_RATE_LIMITS[event];
    const socketAllowed = this.rateLimiter.consume(
      `socket:${client.id}:elimination-${event}`,
      limits.socket,
      60_000,
    );
    if (!socketAllowed) return false;

    const subject = this.rateLimitSubject(client);
    const subjectAllowed = this.rateLimiter.consume(
      `subject:${subject}:elimination-${event}`,
      limits.subject,
      60_000,
    );
    if (!subjectAllowed) return false;

    try {
      const distributedAllowed = await this.redis.consumeRateLimit(
        `elimination:${event}:${subject}`,
        limits.distributed,
        60_000,
      );
      return distributedAllowed !== false;
    } catch {
      return false;
    }
  }

  private rejectRateLimited(client: EliminationSocket) {
    return this.emitError(
      client,
      'RATE_LIMITED',
      'تم إرسال طلبات كثيرة خلال وقت قصير. انتظر دقيقة ثم حاول مجددًا.',
    );
  }

  private resolveGuestId(client: EliminationSocket): string {
    return (this.socketGuestIds.get(client.id) ??
      client.handshake.auth?.guestId ??
      '') as string;
  }

  private resolveAuthenticatedHostId(client: EliminationSocket): string {
    const hostId =
      typeof client.handshake.auth?.hostId === 'string'
        ? client.handshake.auth.hostId.trim()
        : '';
    const hostAccessToken =
      typeof client.handshake.auth?.hostAccessToken === 'string'
        ? client.handshake.auth.hostAccessToken
        : '';
    const secret = resolveTokenSecret(this.config);
    const payload = verifyEliminationHostAccessToken(secret, hostAccessToken);
    if (!payload || payload.hostId !== hostId) return '';
    this.socketHostIds.set(client.id, hostId);
    return hostId;
  }

  private emitPerClientSnapshots(
    roomCode: string,
    room: EliminationRoomRuntime,
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
          'elimination:room:state',
          this.elimination.buildSnapshot(room, guestId ?? null, hostId ?? null),
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

  @SubscribeMessage('elimination:host')
  async hostRoom(
    @ConnectedSocket() client: EliminationSocket,
    @MessageBody()
    payload: {
      totalRounds?: number;
      roundTimeLimit?: number;
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
        'سجّل دخولك من بوابة المضيف لإنشاء حلقة إقصاء.',
      );
    }
    const parsed = createEliminationRoomPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return this.emitError(
        client,
        'INVALID_SETTINGS',
        'إعدادات الحلقة غير صالحة.',
      );
    }

    const result = await this.elimination.createRoom(parsed.data, hostId);
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

  @SubscribeMessage('elimination:join')
  async joinRoom(
    @ConnectedSocket() client: EliminationSocket,
    @MessageBody()
    payload: { roomCode?: string; playerName?: string },
  ) {
    if (!(await this.canHandleEvent(client, 'join'))) {
      return this.rejectRateLimited(client);
    }
    const guestId = (client.handshake.auth?.guestId ?? '') as string;
    const guestToken = (client.handshake.auth?.guestToken ?? '') as string;
    const parsed = joinEliminationRoomPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return this.emitError(
        client,
        'INVALID_JOIN',
        'أدخل رمز حلقة صحيحًا واسمًا بين حرفين و30 حرفًا.',
      );
    }

    const identity = await this.elimination.validateGuest(guestId, guestToken);
    if (!identity) {
      return this.emitError(
        client,
        'INVALID_GUEST',
        'هوية الضيف غير صالحة أو منتهية.',
      );
    }

    const result = await this.elimination.joinRoom(
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

  @SubscribeMessage('elimination:start')
  async startGame(
    @ConnectedSocket() client: EliminationSocket,
    @MessageBody() payload: { roomCode?: string },
  ) {
    if (!(await this.canHandleEvent(client, 'start'))) {
      return this.rejectRateLimited(client);
    }
    const hostId = this.resolveAuthenticatedHostId(client);
    const parsed = eliminationRoomCodePayloadSchema.safeParse({
      roomCode:
        typeof payload?.roomCode === 'string' ? payload.roomCode.trim() : '',
    });
    if (!hostId || !parsed.success) {
      return this.emitError(
        client,
        'NOT_HOST',
        'المضيف الموثّق وحده يستطيع بدء الحلقة.',
      );
    }

    const result = await this.elimination.startGame(
      parsed.data.roomCode,
      hostId,
    );
    if (!result.ok) {
      return this.emitError(client, result.code, result.message);
    }
    this.publishRoomState(result.room);
    this.server
      .to(result.room.roomCode)
      .emit('elimination:countdown', { remaining: 3 });
  }

  @SubscribeMessage('elimination:answer:submit')
  async submitAnswer(
    @ConnectedSocket() client: EliminationSocket,
    @MessageBody()
    payload: {
      roomCode?: string;
      questionId?: string;
      optionIndex?: number;
      submissionId?: string;
    },
  ) {
    if (!(await this.canHandleEvent(client, 'answer'))) {
      return this.rejectRateLimited(client);
    }
    const guestId = this.resolveGuestId(client);
    const parsed = eliminationAnswerSubmitPayloadSchema.safeParse(payload);
    if (!guestId || !parsed.success) {
      return this.emitError(client, 'INVALID_SUBMISSION', 'إرسال غير صالح.');
    }
    const { roomCode, questionId, optionIndex, submissionId } = parsed.data;

    const result = await this.elimination.submitAnswer(
      guestId,
      roomCode,
      questionId,
      optionIndex,
      submissionId,
    );
    if (!result.ok) {
      if (result.submissionId) {
        client.emit('elimination:answer:rejected', {
          submissionId: result.submissionId,
          code: result.code,
          message: result.message,
        });
      }
      return this.emitError(client, result.code, result.message);
    }

    client.emit('elimination:answer:accepted', result.accepted);
    this.publishRoomState(result.room);
  }

  @SubscribeMessage('elimination:next')
  async nextRound(
    @ConnectedSocket() client: EliminationSocket,
    @MessageBody() payload: { roomCode?: string },
  ) {
    if (!(await this.canHandleEvent(client, 'next'))) {
      return this.rejectRateLimited(client);
    }
    const hostId = this.resolveAuthenticatedHostId(client);
    const parsed = eliminationRoomCodePayloadSchema.safeParse({
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

    const result = await this.elimination.nextRound(
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
        .emit('elimination:countdown', { remaining: 3 });
    }
  }

  @SubscribeMessage('elimination:round:end')
  async endRound(
    @ConnectedSocket() client: EliminationSocket,
    @MessageBody() payload: { roomCode?: string },
  ) {
    if (!(await this.canHandleEvent(client, 'roundEnd'))) {
      return this.rejectRateLimited(client);
    }
    const hostId = this.resolveAuthenticatedHostId(client);
    const parsed = eliminationRoomCodePayloadSchema.safeParse({
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

    const result = await this.elimination.endRound(
      parsed.data.roomCode,
      hostId,
    );
    if (!result.ok) {
      return this.emitError(client, result.code, result.message);
    }
    this.publishRoomState(result.room);
  }

  @SubscribeMessage('elimination:game:finish')
  async finishGame(
    @ConnectedSocket() client: EliminationSocket,
    @MessageBody() payload: { roomCode?: string },
  ) {
    if (!(await this.canHandleEvent(client, 'gameFinish'))) {
      return this.rejectRateLimited(client);
    }
    const hostId = this.resolveAuthenticatedHostId(client);
    const parsed = eliminationRoomCodePayloadSchema.safeParse({
      roomCode:
        typeof payload?.roomCode === 'string' ? payload.roomCode.trim() : '',
    });
    if (!hostId || !parsed.success) {
      return this.emitError(
        client,
        'NOT_HOST',
        'المضيف الموثّق وحده يستطيع إنهاء الحلقة.',
      );
    }

    const result = await this.elimination.finishGame(
      parsed.data.roomCode,
      hostId,
    );
    if (!result.ok) {
      return this.emitError(client, result.code, result.message);
    }
    this.publishRoomState(result.room);
  }

  @SubscribeMessage('elimination:leave')
  async leaveRoom(
    @ConnectedSocket() client: EliminationSocket,
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

    const result = await this.elimination.leaveRoom(guestId, roomCode);
    if (!result.ok) {
      this.clearRoundDeadline(roomCode);
      await client.leave(roomCode);
      this.socketRooms.delete(client.id);
      this.socketGuestIds.delete(client.id);
      this.socketHostIds.delete(client.id);
      if (result.code === 'HOST_LEFT') {
        this.server.to(roomCode).emit('elimination:error', {
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

  @SubscribeMessage('elimination:reconnect')
  async reconnect(
    @ConnectedSocket() client: EliminationSocket,
    @MessageBody() payload: { roomCode?: string },
  ) {
    if (!(await this.canHandleEvent(client, 'reconnect'))) {
      return this.rejectRateLimited(client);
    }
    const hostId = this.resolveAuthenticatedHostId(client);
    const guestId = (client.handshake.auth?.guestId ?? '') as string;
    const guestToken = (client.handshake.auth?.guestToken ?? '') as string;
    const parsed = eliminationRoomCodePayloadSchema.safeParse({
      roomCode:
        typeof payload?.roomCode === 'string' ? payload.roomCode.trim() : '',
    });
    if (!parsed.success) {
      return this.emitError(client, 'INVALID_GUEST', 'اتصال غير مصرح به.');
    }
    const roomCode = parsed.data.roomCode;

    if (hostId) {
      const room = await this.elimination.getRoom(roomCode);
      if (!room) {
        return this.emitError(client, 'ROOM_NOT_FOUND', 'الغرفة غير موجودة.');
      }
      if (room.hostId !== hostId) {
        return this.emitError(
          client,
          'NOT_HOST',
          'لا تملك صلاحية إدارة هذه الحلقة.',
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

    const identity = await this.elimination.validateGuest(guestId, guestToken);
    if (!identity) {
      return this.emitError(
        client,
        'INVALID_GUEST',
        'هوية الضيف غير صالحة أو منتهية.',
      );
    }

    const result = await this.elimination.handleReconnect(guestId, roomCode);
    if (!result.ok) {
      return this.emitError(client, result.code, result.message);
    }
    const room = await this.refreshExpiredRound(result.room);
    if (!(await this.attachClientToRoom(client, roomCode, guestId))) return;
    this.publishRoomState(room);
  }

  @SubscribeMessage('elimination:sync')
  async syncRoom(
    @ConnectedSocket() client: EliminationSocket,
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
    const storedRoom = await this.elimination.getRoom(roomCode);
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
      'elimination:room:state',
      this.elimination.buildSnapshot(room, guestId || null, hostId || null),
    );
    this.scheduleRoundDeadline(room);
  }
}

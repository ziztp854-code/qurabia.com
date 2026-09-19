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
import { verifyLadderHostAccessToken } from '@tahaddi/contracts';
import {
  allowWebSocketOrigin,
  allowWebSocketRequest,
} from '../config/web-origins.js';
import { resolveTokenSecret } from '../config/token-secret.js';
import { SocketEventRateLimiter } from '../special-games/socket-event-rate-limiter.js';
import { RedisService } from '../game/redis.service.js';
import { LadderService } from './ladder.service.js';
import {
  createLadderRoomPayloadSchema,
  joinLadderRoomPayloadSchema,
} from './ladder.types.js';
import type {
  ClientToServerLadderEvents,
  ServerToClientLadderEvents,
} from './ladder.types.js';
import type { LadderRoomRuntime } from './ladder.types.js';

type LadderSocket = Socket<
  ClientToServerLadderEvents,
  ServerToClientLadderEvents
>;
type LadderServer = Server<
  ClientToServerLadderEvents,
  ServerToClientLadderEvents
>;

type LadderRateLimitEvent =
  'host' | 'join' | 'start' | 'answer' | 'reconnect' | 'leave' | 'sync';

const LADDER_RATE_LIMITS: Record<
  LadderRateLimitEvent,
  { socket: number; subject: number; distributed: number }
> = {
  host: { socket: 3, subject: 30, distributed: 30 },
  join: { socket: 10, subject: 100, distributed: 100 },
  start: { socket: 10, subject: 30, distributed: 30 },
  answer: { socket: 120, subject: 180, distributed: 180 },
  reconnect: { socket: 10, subject: 30, distributed: 30 },
  leave: { socket: 20, subject: 60, distributed: 60 },
  sync: { socket: 80, subject: 240, distributed: 240 },
};

@WebSocketGateway({
  cors: { origin: allowWebSocketOrigin, credentials: true },
  allowRequest: allowWebSocketRequest,
  namespace: '/ladder',
})
export class LadderGateway
  implements OnGatewayInit<LadderServer>, OnGatewayDisconnect<LadderSocket>
{
  @WebSocketServer()
  server!: LadderServer;

  private readonly socketRooms = new Map<string, string>();
  private readonly socketGuestIds = new Map<string, string>();
  private readonly socketHostIds = new Map<string, string>();
  private readonly questionDeadlineTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private readonly rateLimiter = new SocketEventRateLimiter();

  constructor(
    private readonly ladder: LadderService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  afterInit() {
    // no-op
  }

  async handleDisconnect(client: LadderSocket) {
    this.rateLimiter.clearSocket(client.id);
    const guestId = this.socketGuestIds.get(client.id);
    const roomCode = this.socketRooms.get(client.id);
    if (roomCode && guestId) {
      const currentRoom = await this.ladder.getRoom(roomCode);
      if (currentRoom) {
        const team = currentRoom.teams.find((t) => t.id === guestId);
        if (!team) {
          this.socketRooms.delete(client.id);
          this.socketGuestIds.delete(client.id);
          return;
        }
      }
    }
    this.socketRooms.delete(client.id);
    this.socketGuestIds.delete(client.id);
    this.socketHostIds.delete(client.id);
  }

  private emitError(client: LadderSocket, code: string, message: string) {
    client.emit('ladder:error', { code, message });
  }

  private clearQuestionDeadline(roomCode: string) {
    const timer = this.questionDeadlineTimers.get(roomCode);
    if (timer) clearTimeout(timer);
    this.questionDeadlineTimers.delete(roomCode);
  }

  private scheduleQuestionDeadline(room: LadderRoomRuntime) {
    this.clearQuestionDeadline(room.roomCode);
    if (
      room.status !== 'active' ||
      !room.currentQuestionId ||
      room.questionDeadlineAt === null ||
      room.questionDeadlineAt === undefined
    ) {
      return;
    }

    const questionId = room.currentQuestionId;
    const delay = Math.max(0, room.questionDeadlineAt - Date.now()) + 5;
    const timer = setTimeout(() => {
      void this.handleQuestionDeadline(room.roomCode, questionId);
    }, delay);
    timer.unref?.();
    this.questionDeadlineTimers.set(room.roomCode, timer);
  }

  private emitGameEnd(room: LadderRoomRuntime) {
    const winner =
      room.rightPosition >= room.winningPosition
        ? 'right'
        : room.leftPosition >= room.winningPosition
          ? 'left'
          : 'draw';
    this.server.to(room.roomCode).emit('ladder:game:end', {
      winner,
      rightScore: room.rightScore,
      leftScore: room.leftScore,
      durationMs: room.endedAt
        ? room.endedAt - (room.startedAt ?? room.endedAt)
        : 0,
    });
  }

  private publishRoomState(room: LadderRoomRuntime) {
    this.emitPerClientSnapshots(room.roomCode, room);
    if (room.stopReason) {
      this.server.to(room.roomCode).emit('ladder:error', room.stopReason);
    }
    if (room.status === 'finished') {
      this.clearQuestionDeadline(room.roomCode);
      this.emitGameEnd(room);
      return;
    }
    this.scheduleQuestionDeadline(room);
  }

  private async handleQuestionDeadline(roomCode: string, questionId: string) {
    this.questionDeadlineTimers.delete(roomCode);
    const result = await this.ladder.expireQuestion(roomCode, questionId);
    if (!result.ok) {
      if (result.code === 'QUESTION_NOT_EXPIRED') {
        const room = await this.ladder.getRoom(roomCode);
        if (room) this.scheduleQuestionDeadline(room);
      }
      return;
    }
    this.publishRoomState(result.room);
  }

  private async refreshExpiredRoom(
    room: LadderRoomRuntime,
  ): Promise<LadderRoomRuntime> {
    if (
      room.status !== 'active' ||
      !room.currentQuestionId ||
      room.questionDeadlineAt == null ||
      Date.now() < room.questionDeadlineAt
    ) {
      return room;
    }
    const result = await this.ladder.expireQuestion(
      room.roomCode,
      room.currentQuestionId,
    );
    return result.ok ? result.room : room;
  }

  private async attachClientToRoom(
    client: LadderSocket,
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

  private rateLimitSubject(client: LadderSocket) {
    const address = client.handshake.address?.trim();
    const boundedSubject =
      address && address.length <= 128
        ? `address:${address}`
        : `guest:${this.resolveGuestId(client).slice(0, 128) || 'unknown'}`;
    return createHash('sha256').update(boundedSubject).digest('hex');
  }

  private async canHandleEvent(
    client: LadderSocket,
    event: LadderRateLimitEvent,
  ) {
    const limits = LADDER_RATE_LIMITS[event];
    const socketAllowed = this.rateLimiter.consume(
      `socket:${client.id}:ladder-${event}`,
      limits.socket,
      60_000,
    );
    if (!socketAllowed) return false;

    const subject = this.rateLimitSubject(client);
    const subjectAllowed = this.rateLimiter.consume(
      `subject:${subject}:ladder-${event}`,
      limits.subject,
      60_000,
    );
    if (!subjectAllowed) return false;

    try {
      const distributedAllowed = await this.redis.consumeRateLimit(
        `ladder:${event}:${subject}`,
        limits.distributed,
        60_000,
      );
      return distributedAllowed !== false;
    } catch {
      return false;
    }
  }

  private rejectRateLimited(client: LadderSocket) {
    return this.emitError(
      client,
      'RATE_LIMITED',
      'تم إرسال طلبات كثيرة خلال وقت قصير. انتظر دقيقة ثم حاول مجددًا.',
    );
  }

  private resolveGuestId(client: LadderSocket): string {
    return (this.socketGuestIds.get(client.id) ??
      client.handshake.auth?.guestId ??
      '') as string;
  }

  private resolveAuthenticatedHostId(client: LadderSocket): string {
    const hostId =
      typeof client.handshake.auth?.hostId === 'string'
        ? client.handshake.auth.hostId.trim()
        : '';
    const hostAccessToken =
      typeof client.handshake.auth?.hostAccessToken === 'string'
        ? client.handshake.auth.hostAccessToken
        : '';
    const secret = resolveTokenSecret(this.config);
    const payload = verifyLadderHostAccessToken(secret, hostAccessToken);
    if (!payload || payload.hostId !== hostId) return '';
    this.socketHostIds.set(client.id, hostId);
    return hostId;
  }

  private emitPerClientSnapshots(roomCode: string, room: LadderRoomRuntime) {
    const emittedSocketIds = new Set<string>();
    const emitToSocket = (
      socketId: string,
      guestId?: string,
      hostId?: string,
    ) => {
      if (emittedSocketIds.has(socketId)) return;
      emittedSocketIds.add(socketId);
      const team = guestId
        ? room.teams.find((t) => t.id === guestId)?.team
        : undefined;
      this.server
        .to(socketId)
        .emit(
          'ladder:room:state',
          this.ladder.buildSnapshot(room, team, guestId, hostId),
        );
    };

    for (const team of room.teams) {
      emitToSocket(team.id, team.id);
    }

    for (const [socketId, roomPin] of this.socketRooms.entries()) {
      if (roomPin !== roomCode) continue;
      const guestId = this.socketGuestIds.get(socketId);
      const hostId = this.socketHostIds.get(socketId);
      emitToSocket(socketId, guestId, hostId);
    }
  }

  @SubscribeMessage('ladder:host')
  async hostRoom(
    @ConnectedSocket() client: LadderSocket,
    @MessageBody()
    payload: {
      totalRounds?: number;
      winningPosition?: number;
      questionTimeLimit?: number;
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
        'سجّل دخولك من بوابة المضيف لإنشاء غرفة السلم.',
      );
    }
    const parsed = createLadderRoomPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return this.emitError(
        client,
        'INVALID_SETTINGS',
        'إعدادات اللعبة غير صالحة.',
      );
    }

    const result = await this.ladder.createRoom(parsed.data, hostId);
    if (!result.ok) {
      return this.emitError(client, result.code, result.message);
    }
    const room = result.room;
    if (
      !(await this.attachClientToRoom(client, room.roomCode, undefined, hostId))
    )
      return;
    this.emitPerClientSnapshots(room.roomCode, room);
  }

  @SubscribeMessage('ladder:join')
  async joinRoom(
    @ConnectedSocket() client: LadderSocket,
    @MessageBody()
    payload: {
      roomCode?: string;
      playerName?: string;
      team?: 'right' | 'left';
    },
  ) {
    if (!(await this.canHandleEvent(client, 'join'))) {
      return this.rejectRateLimited(client);
    }
    const guestId = (client.handshake.auth?.guestId ?? '') as string;
    const guestToken = (client.handshake.auth?.guestToken ?? '') as string;
    const parsed = joinLadderRoomPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return this.emitError(
        client,
        'INVALID_JOIN',
        'أدخل رمز غرفة من 8 أحرف واسمًا بين حرفين و30 حرفًا.',
      );
    }

    const identity = await this.ladder.validateGuest(guestId, guestToken);
    if (!identity) {
      return this.emitError(
        client,
        'INVALID_GUEST',
        'هوية الضيف غير صالحة أو منتهية.',
      );
    }

    const result = await this.ladder.joinRoom(parsed.data, guestId, guestToken);
    if (!result.ok) {
      return this.emitError(client, result.code, result.message);
    }
    const room = result.room;
    if (!(await this.attachClientToRoom(client, room.roomCode, guestId)))
      return;
    this.emitPerClientSnapshots(room.roomCode, room);
  }

  @SubscribeMessage('ladder:start')
  async startGame(
    @ConnectedSocket() client: LadderSocket,
    @MessageBody() payload: { roomCode?: string },
  ) {
    if (!(await this.canHandleEvent(client, 'start'))) {
      return this.rejectRateLimited(client);
    }
    const hostId = this.resolveAuthenticatedHostId(client);
    const roomCode =
      typeof payload?.roomCode === 'string'
        ? payload.roomCode.trim().toUpperCase()
        : '';
    if (!hostId || !roomCode) {
      return this.emitError(
        client,
        'NOT_HOST',
        'المضيف الموثّق وحده يستطيع بدء اللعبة.',
      );
    }

    const result = await this.ladder.startGame(roomCode, hostId);
    if (!result.ok) {
      return this.emitError(client, result.code, result.message);
    }
    const room = result.room;
    this.publishRoomState(room);
    this.server.to(room.roomCode).emit('ladder:countdown', { remaining: 3 });
  }

  @SubscribeMessage('ladder:answer')
  async submitAnswer(
    @ConnectedSocket() client: LadderSocket,
    @MessageBody()
    payload: { roomCode?: string; questionId?: string; optionId?: string },
  ) {
    if (!(await this.canHandleEvent(client, 'answer'))) {
      return this.rejectRateLimited(client);
    }
    const guestId = this.resolveGuestId(client);
    const roomCode =
      typeof payload?.roomCode === 'string'
        ? payload.roomCode.trim().toUpperCase()
        : '';
    const questionId =
      typeof payload?.questionId === 'string' ? payload.questionId : '';
    const optionId =
      typeof payload?.optionId === 'string' ? payload.optionId : '';
    if (!guestId || !roomCode || !questionId || !optionId) {
      return this.emitError(client, 'INVALID_SESSION', 'جلسة غير صالحة.');
    }

    const result = await this.ladder.submitAnswer(
      guestId,
      roomCode,
      questionId,
      optionId,
    );
    if (!result.ok) {
      return this.emitError(client, result.code, result.message);
    }
    const room = result.room;
    this.publishRoomState(room);
  }

  @SubscribeMessage('ladder:leave')
  async leaveRoom(
    @ConnectedSocket() client: LadderSocket,
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

    const result = await this.ladder.leaveRoom(guestId, roomCode);
    if (!result.ok && result.code !== 'HOST_LEFT') {
      return this.emitError(client, result.code, result.message);
    }
    if (result.ok) {
      if (result.room.status === 'finished') {
        this.clearQuestionDeadline(roomCode);
      }
      await client.leave(roomCode);
      this.socketRooms.delete(client.id);
      this.socketGuestIds.delete(client.id);
      this.socketHostIds.delete(client.id);
      this.emitPerClientSnapshots(roomCode, result.room);
    } else if (result.code === 'HOST_LEFT') {
      this.clearQuestionDeadline(roomCode);
      await client.leave(roomCode);
      this.socketRooms.delete(client.id);
      this.socketGuestIds.delete(client.id);
      this.socketHostIds.delete(client.id);
      this.server
        .to(roomCode)
        .emit('ladder:error', { code: 'HOST_LEFT', message: result.message });
    }
  }

  @SubscribeMessage('ladder:reconnect')
  async reconnect(
    @ConnectedSocket() client: LadderSocket,
    @MessageBody() payload: { roomCode?: string },
  ) {
    if (!(await this.canHandleEvent(client, 'reconnect'))) {
      return this.rejectRateLimited(client);
    }
    const hostId = this.resolveAuthenticatedHostId(client);
    const guestId = (client.handshake.auth?.guestId ?? '') as string;
    const guestToken = (client.handshake.auth?.guestToken ?? '') as string;
    const roomCode =
      typeof payload?.roomCode === 'string'
        ? payload.roomCode.trim().toUpperCase()
        : '';
    if (!roomCode) {
      return this.emitError(client, 'INVALID_GUEST', 'اتصال غير مصرح به.');
    }

    if (hostId) {
      const result = await this.ladder.handleHostReconnect(hostId, roomCode);
      if (!result.ok) {
        return this.emitError(client, result.code, result.message);
      }
      const room = await this.refreshExpiredRoom(result.room);
      if (
        !(await this.attachClientToRoom(
          client,
          room.roomCode,
          undefined,
          hostId,
        ))
      )
        return;
      this.publishRoomState(room);
      return;
    }

    if (!guestId || !guestToken) {
      return this.emitError(client, 'INVALID_GUEST', 'اتصال غير مصرح به.');
    }

    const identity = await this.ladder.validateGuest(guestId, guestToken);
    if (!identity) {
      return this.emitError(
        client,
        'INVALID_GUEST',
        'هوية الضيف غير صالحة أو منتهية.',
      );
    }

    const result = await this.ladder.handleReconnect(guestId, roomCode);
    if (!result.ok) {
      return this.emitError(client, result.code, result.message);
    }
    const room = await this.refreshExpiredRoom(result.room);
    if (!(await this.attachClientToRoom(client, room.roomCode, guestId)))
      return;
    this.publishRoomState(room);
  }

  @SubscribeMessage('ladder:sync')
  async syncRoom(
    @ConnectedSocket() client: LadderSocket,
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
    const storedRoom = await this.ladder.getRoom(roomCode);
    if (!storedRoom) {
      return this.emitError(client, 'ROOM_NOT_FOUND', 'الغرفة غير موجودة.');
    }
    const room = await this.refreshExpiredRoom(storedRoom);
    if (room !== storedRoom) {
      this.publishRoomState(room);
      return;
    }
    const guestId = this.resolveGuestId(client);
    const hostId = this.socketHostIds.get(client.id);
    const team = guestId
      ? room.teams.find((t) => t.id === guestId)?.team
      : undefined;
    client.emit(
      'ladder:room:state',
      this.ladder.buildSnapshot(room, team, guestId, hostId),
    );
    this.scheduleQuestionDeadline(room);
  }
}

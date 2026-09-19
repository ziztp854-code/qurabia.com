import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { createHash } from 'node:crypto';
import {
  allowWebSocketOrigin,
  allowWebSocketRequest,
} from '../config/web-origins.js';
import { SocketEventRateLimiter } from '../special-games/socket-event-rate-limiter.js';
import { RedisService } from '../game/redis.service.js';
import { ChessService } from './chess.service.js';
import {
  chessPinSchema,
  createChessRoomPayloadSchema,
  joinChessRoomPayloadSchema,
  spectateChessRoomPayloadSchema,
} from './chess.types.js';
import type {
  ClientToServerChessEvents,
  ServerToClientChessEvents,
} from './chess.types.js';
import type { ChessRoom } from '@tahaddi/domain';

type ChessSocket = Socket<ClientToServerChessEvents, ServerToClientChessEvents>;
type ChessServer = Server<ClientToServerChessEvents, ServerToClientChessEvents>;

type ChessRateLimitEvent =
  'create' | 'join' | 'spectate' | 'reconnect' | 'sync' | 'move';

const CHESS_RATE_LIMITS: Record<
  ChessRateLimitEvent,
  { socket: number; subject: number; distributed: number }
> = {
  create: { socket: 3, subject: 30, distributed: 30 },
  join: { socket: 10, subject: 100, distributed: 100 },
  spectate: { socket: 10, subject: 100, distributed: 100 },
  reconnect: { socket: 10, subject: 30, distributed: 30 },
  sync: { socket: 80, subject: 240, distributed: 240 },
  move: { socket: 120, subject: 180, distributed: 180 },
};

/** Ignore Socket.IO ping/proxy flaps before marking the seat offline. */
export const CHESS_TRANSPORT_DISCONNECT_DELAY_MS = 8_000;

@WebSocketGateway({
  cors: { origin: allowWebSocketOrigin, credentials: true },
  allowRequest: allowWebSocketRequest,
  namespace: '/special-games',
  pingInterval: 25_000,
  pingTimeout: 60_000,
})
export class ChessGateway
  implements OnGatewayInit<ChessServer>, OnGatewayDisconnect<ChessSocket>
{
  @WebSocketServer()
  server!: ChessServer;

  private readonly socketRooms = new Map<string, string>();
  private readonly socketGuestIds = new Map<string, string>();
  private readonly rateLimiter = new SocketEventRateLimiter();
  private clockIntervals = new Map<string, NodeJS.Timeout>();
  private readonly pendingSeatDisconnects = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly chess: ChessService,
    private readonly redis: RedisService,
  ) {}

  afterInit() {
    // no-op; clock ticking is handled per-room
  }

  async handleDisconnect(client: ChessSocket) {
    this.rateLimiter.clearSocket(client.id);
    const guestId = this.socketGuestIds.get(client.id);
    const pin = this.socketRooms.get(client.id);
    this.socketRooms.delete(client.id);
    this.socketGuestIds.delete(client.id);
    if (!pin || !guestId) return;

    const currentRoom = await this.chess.getRoom(pin);
    const seat = currentRoom ? this.chess.findSeat(currentRoom, guestId) : null;
    if (!seat) return;

    const remainingSeatSockets = await this.redis.removeChessSeatSocket(
      pin,
      guestId,
      client.id,
    );
    if (remainingSeatSockets > 0) return;
    this.scheduleSeatDisconnect(pin, guestId);
  }

  private seatDisconnectKey(pin: string, guestId: string) {
    return `${pin}:${guestId}`;
  }

  private cancelPendingSeatDisconnect(pin: string, guestId: string) {
    const key = this.seatDisconnectKey(pin, guestId);
    const timer = this.pendingSeatDisconnects.get(key);
    if (!timer) return;
    clearTimeout(timer);
    this.pendingSeatDisconnects.delete(key);
  }

  private scheduleSeatDisconnect(pin: string, guestId: string) {
    this.cancelPendingSeatDisconnect(pin, guestId);
    const timer = setTimeout(() => {
      this.pendingSeatDisconnects.delete(this.seatDisconnectKey(pin, guestId));
      void this.finalizeSeatDisconnect(pin, guestId);
    }, CHESS_TRANSPORT_DISCONNECT_DELAY_MS);
    this.pendingSeatDisconnects.set(
      this.seatDisconnectKey(pin, guestId),
      timer,
    );
  }

  private async finalizeSeatDisconnect(pin: string, guestId: string) {
    const remaining = await this.redis.getChessSeatSockets(pin, guestId);
    if (remaining.length > 0) return;
    await this.chess.handleDisconnect(guestId, pin);
    const room = await this.chess.getRoom(pin);
    if (!room) return;
    this.server.to(pin).emit('chess:opponent:disconnect', {
      gracePeriodSeconds: 60,
    });
  }

  private emitError(client: ChessSocket, code: string, message: string) {
    client.emit('chess:error', { code, message });
  }

  private async attachClientToRoom(
    client: ChessSocket,
    room: ChessRoom,
    guestId?: string,
  ) {
    try {
      await client.join(room.pin);
      if (guestId) {
        this.cancelPendingSeatDisconnect(room.pin, guestId);
        await this.redis.addChessSeatSocket(room.pin, guestId, client.id);
        this.socketGuestIds.set(client.id, guestId);
      }
      this.socketRooms.set(client.id, room.pin);
      return true;
    } catch {
      try {
        await client.leave(room.pin);
      } catch {
        // best-effort cleanup after a failed room/socket sync
      }
      this.socketRooms.delete(client.id);
      this.socketGuestIds.delete(client.id);
      this.emitError(
        client,
        'ROOM_SYNC_FAILED',
        'تعذّر تجهيز اتصال الغرفة. حاول مرة أخرى.',
      );
      return false;
    }
  }

  private rateLimitSubject(client: ChessSocket) {
    const address = client.handshake.address?.trim();
    const boundedSubject =
      address && address.length <= 128
        ? `address:${address}`
        : `guest:${this.resolveGuestId(client).slice(0, 128) || 'unknown'}`;
    return createHash('sha256').update(boundedSubject).digest('hex');
  }

  private async canHandleEvent(
    client: ChessSocket,
    event: ChessRateLimitEvent,
  ) {
    const limits = CHESS_RATE_LIMITS[event];
    const socketAllowed = this.rateLimiter.consume(
      `socket:${client.id}:chess-${event}`,
      limits.socket,
      60_000,
    );
    if (!socketAllowed) return false;

    const subject = this.rateLimitSubject(client);
    const subjectAllowed = this.rateLimiter.consume(
      `subject:${subject}:chess-${event}`,
      limits.subject,
      60_000,
    );
    if (!subjectAllowed) return false;

    try {
      const distributedAllowed = await this.redis.consumeRateLimit(
        `chess:${event}:${subject}`,
        limits.distributed,
        60_000,
      );
      return distributedAllowed !== false;
    } catch {
      return false;
    }
  }

  private rejectRateLimited(client: ChessSocket) {
    return this.emitError(
      client,
      'RATE_LIMITED',
      'تم إرسال طلبات كثيرة خلال وقت قصير. انتظر دقيقة ثم حاول مجددًا.',
    );
  }

  private resolveGuestId(client: ChessSocket): string {
    return (this.socketGuestIds.get(client.id) ??
      client.handshake.auth?.guestId ??
      '') as string;
  }

  private async emitPerClientSnapshots(room: ChessRoom) {
    const emittedSocketIds = new Set<string>();
    const emitToSocket = (socketId: string, guestId?: string) => {
      if (emittedSocketIds.has(socketId)) return;
      emittedSocketIds.add(socketId);
      const seat = guestId ? this.chess.findSeat(room, guestId) : undefined;
      this.server
        .to(socketId)
        .emit(
          'chess:room:state',
          this.chess.buildSnapshot(room, seat?.guestId),
        );
    };

    for (const seat of [room.seats.white, room.seats.black]) {
      if (!seat?.guestId) continue;
      const socketIds = await this.redis.getChessSeatSockets(
        room.pin,
        seat.guestId,
      );
      for (const socketId of socketIds) emitToSocket(socketId, seat.guestId);
    }

    for (const [socketId, roomPin] of this.socketRooms.entries()) {
      if (roomPin !== room.pin) continue;
      const guestId = this.socketGuestIds.get(socketId);
      emitToSocket(socketId, guestId);
    }
  }

  private stopClock(pin: string) {
    const interval = this.clockIntervals.get(pin);
    if (interval) clearInterval(interval);
    this.clockIntervals.delete(pin);
  }

  private emitGameEnd(room: ChessRoom) {
    if (!room.result) return;
    this.server.to(room.pin).emit('chess:game:end', {
      reason: room.result.reason,
      winner: room.result.winner ?? 'draw',
      durationMs: room.endedAt
        ? room.endedAt - (room.startedAt ?? room.endedAt)
        : 0,
      moveCount: room.moves.length,
    });
  }

  private startClock(room: ChessRoom) {
    if (
      room.phase !== 'playing' ||
      room.result ||
      room.timeControl.initialSeconds === 0 ||
      this.clockIntervals.has(room.pin)
    ) {
      return;
    }
    const interval = setInterval(() => {
      void this.chess.tickClocks(room.pin).then((latestRoom) => {
        if (!latestRoom) return;
        void this.emitPerClientSnapshots(latestRoom);
        if (latestRoom.result) {
          this.stopClock(room.pin);
          this.emitGameEnd(latestRoom);
        }
      });
    }, 1_000);
    this.clockIntervals.set(room.pin, interval);
  }

  @SubscribeMessage('chess:room:create')
  async createRoom(
    @ConnectedSocket() client: ChessSocket,
    @MessageBody()
    payload: {
      playerName?: string;
      timeControl?: string;
      colorChoice?: string;
    },
  ) {
    if (!(await this.canHandleEvent(client, 'create'))) {
      return this.rejectRateLimited(client);
    }
    const guestId = (client.handshake.auth?.guestId ?? '') as string;
    const guestToken = (client.handshake.auth?.guestToken ?? '') as string;
    if (!guestId || !guestToken) {
      return this.emitError(client, 'INVALID_GUEST', 'اتصال غير مصرح به.');
    }

    const parsed = createChessRoomPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      const invalidName = parsed.error.issues.some(
        (issue) => issue.path[0] === 'playerName',
      );
      return this.emitError(
        client,
        invalidName ? 'INVALID_NAME' : 'INVALID_SETTINGS',
        invalidName
          ? 'اكتب اسمًا بين حرفين و30 حرفًا.'
          : 'إعدادات المباراة غير صالحة.',
      );
    }
    const { playerName, timeControl, colorChoice } = parsed.data;

    const identity = await this.chess.validateGuest(guestId, guestToken);
    if (!identity) {
      return this.emitError(
        client,
        'INVALID_GUEST',
        'هوية الضيف غير صالحة أو منتهية.',
      );
    }

    const result = await this.chess.createRoom(
      { playerName, timeControl, colorChoice },
      guestId,
      guestToken,
    );
    if (!result.ok) {
      return this.emitError(client, result.code, result.message);
    }
    const room = result.room;
    if (!(await this.attachClientToRoom(client, room, guestId))) return;
    await this.emitPerClientSnapshots(room);
  }

  @SubscribeMessage('chess:room:join')
  async joinRoom(
    @ConnectedSocket() client: ChessSocket,
    @MessageBody() payload: { pin?: string; playerName?: string },
  ) {
    if (!(await this.canHandleEvent(client, 'join'))) {
      return this.rejectRateLimited(client);
    }
    const guestId = (client.handshake.auth?.guestId ?? '') as string;
    const guestToken = (client.handshake.auth?.guestToken ?? '') as string;
    const parsed = joinChessRoomPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return this.emitError(
        client,
        'INVALID_JOIN',
        'أدخل رمز غرفة من 6 أرقام واسمًا بين حرفين و30 حرفًا.',
      );
    }
    const { pin, playerName } = parsed.data;

    const identity = await this.chess.validateGuest(guestId, guestToken);
    if (!identity) {
      return this.emitError(
        client,
        'INVALID_GUEST',
        'هوية الضيف غير صالحة أو منتهية.',
      );
    }

    const result = await this.chess.joinRoom(
      { pin, playerName },
      guestId,
      guestToken,
    );
    if (!result.ok) {
      return this.emitError(client, result.code, result.message);
    }
    const room = result.room;
    if (!(await this.attachClientToRoom(client, room, guestId))) return;
    await this.emitPerClientSnapshots(room);
  }

  @SubscribeMessage('chess:reconnect')
  async reconnect(
    @ConnectedSocket() client: ChessSocket,
    @MessageBody() payload: { pin?: string; guestId?: string },
  ) {
    if (!(await this.canHandleEvent(client, 'reconnect'))) {
      return this.rejectRateLimited(client);
    }
    const guestId = (client.handshake.auth?.guestId ?? '') as string;
    const guestToken = (client.handshake.auth?.guestToken ?? '') as string;
    const pin = typeof payload?.pin === 'string' ? payload.pin.trim() : '';
    if (!guestId || !guestToken || !pin) {
      return this.emitError(client, 'INVALID_GUEST', 'اتصال غير مصرح به.');
    }
    const identity = await this.chess.validateGuest(guestId, guestToken);
    if (!identity) {
      return this.emitError(
        client,
        'INVALID_GUEST',
        'هوية الضيف غير صالحة أو منتهية.',
      );
    }
    const result = await this.chess.handleReconnect(guestId, pin);
    if (!result.ok) {
      return this.emitError(client, result.code, result.message);
    }
    const room = result.room;
    if (!(await this.attachClientToRoom(client, room, guestId))) return;
    await this.emitPerClientSnapshots(room);
    client.to(room.pin).emit('chess:opponent:reconnect');
    this.startClock(room);
  }

  @SubscribeMessage('chess:spectate')
  async spectate(
    @ConnectedSocket() client: ChessSocket,
    @MessageBody() payload: { pin?: string; spectatorName?: string },
  ) {
    if (!(await this.canHandleEvent(client, 'spectate'))) {
      return this.rejectRateLimited(client);
    }
    const parsed = spectateChessRoomPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return this.emitError(
        client,
        'INVALID_SPECTATE',
        'أدخل رمز غرفة من 6 أرقام واسمًا لا يتجاوز 30 حرفًا.',
      );
    }
    const result = await this.chess.spectate({
      ...parsed.data,
      spectatorId: `spectator_${this.resolveGuestId(client) || client.id}`,
    });
    if (!result.ok) {
      return this.emitError(client, result.code, result.message);
    }
    const room = result.room;
    if (!(await this.attachClientToRoom(client, room))) return;
    await this.emitPerClientSnapshots(room);
  }

  @SubscribeMessage('chess:sync')
  async syncRoom(
    @ConnectedSocket() client: ChessSocket,
    @MessageBody() payload: { pin?: string },
  ) {
    if (!(await this.canHandleEvent(client, 'sync'))) {
      return this.rejectRateLimited(client);
    }
    const pin =
      typeof payload?.pin === 'string'
        ? payload.pin.trim()
        : (this.socketRooms.get(client.id) ?? '');
    if (!pin) return;
    const room = await this.chess.getRoom(pin);
    if (!room) {
      return this.emitError(client, 'ROOM_NOT_FOUND', 'الغرفة غير موجودة.');
    }
    const guestId = this.resolveGuestId(client);
    const seat = guestId ? this.chess.findSeat(room, guestId) : undefined;
    client.emit(
      'chess:room:state',
      this.chess.buildSnapshot(room, seat?.guestId),
    );
  }

  @SubscribeMessage('chess:player:ready')
  async playerReady(
    @ConnectedSocket() client: ChessSocket,
    @MessageBody() payload: { pin?: string },
  ) {
    const guestId = this.resolveGuestId(client);
    const pin = typeof payload?.pin === 'string' ? payload.pin.trim() : '';
    if (!pin) return;
    const room = await this.chess.getRoom(pin);
    if (!room)
      return this.emitError(client, 'ROOM_NOT_FOUND', 'الغرفة غير موجودة.');
    const seat = this.chess.findSeat(room, guestId);
    if (!seat)
      return this.emitError(client, 'NOT_A_PLAYER', 'انضم إلى الغرفة أولاً.');
    if (room.phase !== 'ready') return;
    if (room.seats.white?.connected && room.seats.black?.connected) {
      const startResult = await this.chess.startGame(pin, room.hostGuestId);
      if (startResult.ok) {
        await this.emitPerClientSnapshots(startResult.room);
        this.server.to(pin).emit('chess:countdown', { remaining: 3 });
        setTimeout(() => {
          void this.chess.countdownComplete(pin).then((countdownResult) => {
            if (countdownResult.ok) {
              void this.emitPerClientSnapshots(countdownResult.room);
              this.startClock(countdownResult.room);
            }
          });
        }, 3000);
      }
    }
  }

  @SubscribeMessage('chess:move')
  async submitMove(
    @ConnectedSocket() client: ChessSocket,
    @MessageBody()
    payload: {
      pin?: string;
      from?: string;
      to?: string;
      promotion?: string;
      expectedVersion?: number;
    },
  ) {
    if (!(await this.canHandleEvent(client, 'move'))) {
      return this.rejectRateLimited(client);
    }
    const guestId = this.resolveGuestId(client);
    let pin = this.socketRooms.get(client.id) ?? '';
    if (!guestId) {
      return this.emitError(client, 'INVALID_SESSION', 'جلسة غير صالحة.');
    }
    if (!pin) {
      const parsedPin = chessPinSchema.safeParse(payload?.pin);
      if (!parsedPin.success) {
        return this.emitError(client, 'INVALID_SESSION', 'جلسة غير صالحة.');
      }
      const requestedPin = parsedPin.data;
      const guestToken = (client.handshake.auth?.guestToken ?? '') as string;
      const identity = await this.chess.validateGuest(guestId, guestToken);
      if (!identity || identity.pin !== requestedPin) {
        return this.emitError(client, 'INVALID_SESSION', 'جلسة غير صالحة.');
      }
      const reconnectResult = await this.chess.handleReconnect(
        guestId,
        requestedPin,
      );
      if (!reconnectResult.ok) {
        return this.emitError(client, 'INVALID_SESSION', 'جلسة غير صالحة.');
      }
      if (
        !(await this.attachClientToRoom(client, reconnectResult.room, guestId))
      )
        return;
      pin = reconnectResult.room.pin;
    }
    const from =
      typeof payload?.from === 'string'
        ? payload.from.trim().toLowerCase()
        : '';
    const to =
      typeof payload?.to === 'string' ? payload.to.trim().toLowerCase() : '';
    const promotion =
      typeof payload?.promotion === 'string'
        ? payload.promotion.toLowerCase()
        : undefined;
    const expectedVersion =
      typeof payload?.expectedVersion === 'number'
        ? payload.expectedVersion
        : -1;

    if (!from || !to) {
      return this.emitError(client, 'INVALID_MOVE', 'نقلة غير صالحة.');
    }

    const result = await this.chess.submitMove(guestId, pin, {
      from,
      to,
      promotion,
      expectedVersion,
    });

    if (!result.ok) {
      if (result.code === 'GAME_FINISHED') {
        const room = await this.chess.getRoom(pin);
        if (room?.result) {
          await this.emitPerClientSnapshots(room);
          this.stopClock(pin);
          this.emitGameEnd(room);
          return;
        }
      }
      if (
        result.code === 'STALE_POSITION' &&
        result.currentStateVersion !== undefined &&
        result.latestFen
      ) {
        client.emit('chess:move:rejected', {
          code: result.code,
          message: result.message,
          currentStateVersion: result.currentStateVersion,
          latestFen: result.latestFen,
        });
        const room = await this.chess.getRoom(pin);
        if (room) await this.emitPerClientSnapshots(room);
        return;
      }
      return this.emitError(client, result.code, result.message);
    }

    const room = await this.chess.getRoom(pin);
    if (!room) return;

    await this.emitPerClientSnapshots(room);

    client.emit('chess:move:ack', {
      san: result.san,
      from,
      to,
      promotion,
      newFen: result.newFen,
      newStateVersion: result.newStateVersion,
      isCheck: result.isCheck,
      isCheckmate: result.isCheckmate,
      isStalemate: result.isStalemate,
      isDraw: result.isDraw,
      legalSquares: result.legalSquares,
      gameEnd: result.gameEnd,
    });

    if (result.gameEnd) {
      this.stopClock(pin);
      this.server.to(pin).emit('chess:game:end', {
        reason: result.gameEnd.reason,
        winner: result.gameEnd.winner,
        durationMs: room.endedAt
          ? room.endedAt - (room.startedAt ?? room.endedAt)
          : 0,
        moveCount: room.moves.length,
      });
    }
  }

  @SubscribeMessage('chess:resign')
  async resign(
    @ConnectedSocket() client: ChessSocket,
    @MessageBody() payload: { pin?: string },
  ) {
    const guestId = this.resolveGuestId(client);
    const pin = typeof payload?.pin === 'string' ? payload.pin.trim() : '';
    if (!guestId || !pin) {
      return this.emitError(client, 'INVALID_SESSION', 'جلسة غير صالحة.');
    }
    const result = await this.chess.resign(guestId, pin);
    if (!result.ok) {
      return this.emitError(client, result.code, result.message);
    }
    await this.emitPerClientSnapshots(result.room);
    this.stopClock(pin);
    this.server.to(pin).emit('chess:game:end', {
      reason: 'resignation',
      winner: result.room.result?.winner ?? 'draw',
      durationMs: result.room.endedAt
        ? result.room.endedAt - (result.room.startedAt ?? result.room.endedAt)
        : 0,
      moveCount: result.room.moves.length,
    });
  }

  @SubscribeMessage('chess:draw:offer')
  async offerDraw(
    @ConnectedSocket() client: ChessSocket,
    @MessageBody() payload: { pin?: string },
  ) {
    const guestId = this.resolveGuestId(client);
    const pin = typeof payload?.pin === 'string' ? payload.pin.trim() : '';
    if (!guestId || !pin) return;
    const result = await this.chess.offerDraw(guestId, pin);
    if (!result.ok) return this.emitError(client, result.code, result.message);
    const room = result.room;
    const seat = this.chess.findSeat(room, guestId);
    if (seat) {
      this.server
        .to(pin)
        .emit('chess:draw:offered', { by: seat.color, at: Date.now() });
    }
  }

  @SubscribeMessage('chess:draw:respond')
  async respondDraw(
    @ConnectedSocket() client: ChessSocket,
    @MessageBody() payload: { pin?: string; accept?: boolean },
  ) {
    const guestId = this.resolveGuestId(client);
    const pin = typeof payload?.pin === 'string' ? payload.pin.trim() : '';
    const accept =
      typeof payload?.accept === 'boolean' ? payload.accept : false;
    if (!guestId || !pin) return;
    const result = await this.chess.respondDraw(guestId, pin, accept);
    if (!result.ok) return this.emitError(client, result.code, result.message);
    await this.emitPerClientSnapshots(result.room);
    if (result.room.result) {
      this.stopClock(pin);
      this.server.to(pin).emit('chess:game:end', {
        reason: 'draw_agreement',
        winner: 'draw',
        durationMs: result.room.endedAt
          ? result.room.endedAt - (result.room.startedAt ?? result.room.endedAt)
          : 0,
        moveCount: result.room.moves.length,
      });
    } else {
      this.server.to(pin).emit('chess:draw:result', { accepted: accept });
    }
  }

  @SubscribeMessage('chess:leave')
  async leaveRoom(
    @ConnectedSocket() client: ChessSocket,
    @MessageBody() payload: { pin?: string },
  ) {
    const guestId = this.resolveGuestId(client);
    const pin = typeof payload?.pin === 'string' ? payload.pin.trim() : '';
    if (!guestId || !pin) return;
    const result = await this.chess.leaveRoom(guestId, pin);
    if (!result.ok && result.code !== 'HOST_LEFT') {
      return this.emitError(client, result.code, result.message);
    }
    this.cancelPendingSeatDisconnect(pin, guestId);
    if (result.ok) {
      await client.leave(pin);
      this.socketRooms.delete(client.id);
      this.socketGuestIds.delete(client.id);
      await this.redis.removeChessSeatSocket(pin, guestId, client.id);
      await this.emitPerClientSnapshots(result.room);
      if (
        (result.room.phase === 'countdown' ||
          result.room.phase === 'playing') &&
        !result.room.result
      ) {
        this.server.to(pin).emit('chess:opponent:disconnect', {
          gracePeriodSeconds: 60,
        });
      }
    } else if (result.code === 'HOST_LEFT') {
      this.stopClock(pin);
      await client.leave(pin);
      this.socketRooms.delete(client.id);
      this.socketGuestIds.delete(client.id);
      await this.redis.removeChessSeatSocket(pin, guestId, client.id);
      this.server
        .to(pin)
        .emit('chess:error', { code: 'HOST_LEFT', message: result.message });
    }
  }
}

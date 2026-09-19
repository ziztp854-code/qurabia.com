import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { BALOOT_RULES } from '@tahaddi/domain';
import {
  allowWebSocketOrigin,
  allowWebSocketRequest,
} from '../config/web-origins.js';
import { SocketEventRateLimiter } from '../special-games/socket-event-rate-limiter.js';
import { BalootService } from './baloot.service.js';
import type {
  BalootResult,
  BalootSession,
  BalootSnapshot,
  BidBalootPayload,
  ClientToServerBalootEvents,
  CreateBalootRoomPayload,
  JoinBalootRoomPayload,
  LeaveBalootPayload,
  NextRoundBalootPayload,
  PlayBalootCardPayload,
  ReadyBalootPayload,
  ReconnectBalootPayload,
  ServerToClientBalootEvents,
  StartBalootPayload,
} from './baloot.types.js';

type BalootSocketData = {
  balootSessionToken?: string;
  balootRoomCode?: string;
};
type BalootSocket = Socket<
  ClientToServerBalootEvents,
  ServerToClientBalootEvents,
  Record<string, never>,
  BalootSocketData
>;

const name = z.string().trim().min(2).max(30);
const command = {
  expectedVersion: z.number().int().nonnegative(),
  commandId: z.string().trim().min(1).max(100),
};
const schemas = {
  host: z.object({ playerName: name }),
  join: z.object({
    roomCode: z
      .string()
      .trim()
      .regex(/^\d{6}$/),
    playerName: name,
    sessionToken: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  }),
  ready: z.object({ ready: z.boolean() }),
  start: z.object({}).strict(),
  reconnect: z.object({ sessionToken: z.string().regex(/^[a-f0-9]{64}$/) }),
  bid: z.object({
    ...command,
    bid: z.discriminatedUnion('mode', [
      z.object({ mode: z.literal('pass') }),
      z.object({ mode: z.literal('sun') }),
      z.object({ mode: z.literal('ashkal') }),
      z.object({ mode: z.literal('accept') }),
      z.object({
        mode: z.literal('hokum'),
        trump: z.enum(['clubs', 'diamonds', 'hearts', 'spades']),
      }),
      z.object({
        mode: z.literal('double'),
        play: z.enum(['open', 'locked']),
      }),
      z.object({ mode: z.literal('triple') }),
      z.object({
        mode: z.literal('quadruple'),
        play: z.enum(['open', 'locked']),
      }),
      z.object({ mode: z.literal('gahwa') }),
    ]),
  }),
  playCard: z.object({
    ...command,
    card: z.object({
      suit: z.enum(['clubs', 'diamonds', 'hearts', 'spades']),
      rank: z.enum(['7', '8', '9', '10', 'J', 'Q', 'K', 'A']),
    }),
  }),
};

@WebSocketGateway({
  namespace: '/baloot',
  cors: { origin: allowWebSocketOrigin, credentials: true },
  allowRequest: allowWebSocketRequest,
})
export class BalootGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server<ClientToServerBalootEvents, ServerToClientBalootEvents>;

  private readonly sockets = new Map<
    string,
    { roomCode: string; sessionToken: string }
  >();
  private readonly pendingDisconnects = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private readonly turnTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private readonly rateLimiter = new SocketEventRateLimiter();

  constructor(private readonly baloot: BalootService) {}

  @SubscribeMessage('baloot:host')
  async createRoom(
    @ConnectedSocket() client: BalootSocket,
    @MessageBody() payload: CreateBalootRoomPayload,
  ) {
    const parsed = schemas.host.safeParse(payload);
    if (!parsed.success) return this.invalidPayload();
    if (!this.consume(client, 'host', 5)) return this.rateLimited();
    const identity = this.identity(client);
    if (identity) await this.detach(client, identity);
    return this.attach(client, await this.baloot.createRoom(parsed.data));
  }

  @SubscribeMessage('baloot:join')
  async joinRoom(
    @ConnectedSocket() client: BalootSocket,
    @MessageBody() payload: JoinBalootRoomPayload,
  ) {
    const parsed = schemas.join.safeParse(payload);
    if (!parsed.success) return this.invalidPayload();
    if (!this.consume(client, 'join', 30)) return this.rateLimited();
    const identity = this.identity(client);
    if (identity?.roomCode === parsed.data.roomCode) {
      return this.attach(
        client,
        await this.baloot.resume(identity.sessionToken),
      );
    }
    if (identity) await this.detach(client, identity);
    return this.attach(client, await this.baloot.joinRoom(parsed.data));
  }

  @SubscribeMessage('baloot:ready')
  async ready(
    @ConnectedSocket() client: BalootSocket,
    @MessageBody() payload: ReadyBalootPayload,
  ) {
    const parsed = schemas.ready.safeParse(payload);
    if (!parsed.success) return this.invalidPayload();
    if (!this.consume(client, 'action', 120)) return this.rateLimited();
    const identity = this.identity(client);
    if (!identity) return this.invalidSession();
    const result = await this.baloot.setReady(
      identity.roomCode,
      identity.sessionToken,
      parsed.data.ready,
    );
    if (result.ok) await this.broadcast(identity.roomCode);
    return result;
  }

  @SubscribeMessage('baloot:start')
  async start(
    @ConnectedSocket() client: BalootSocket,
    @MessageBody() payload: StartBalootPayload,
  ) {
    if (!schemas.start.safeParse(payload).success) return this.invalidPayload();
    if (!this.consume(client, 'action', 120)) return this.rateLimited();
    const identity = this.identity(client);
    if (!identity) return this.invalidSession();
    const result = await this.baloot.startGame(
      identity.roomCode,
      identity.sessionToken,
    );
    if (result.ok) await this.broadcast(identity.roomCode);
    return result;
  }

  @SubscribeMessage('baloot:reconnect')
  async reconnect(
    @ConnectedSocket() client: BalootSocket,
    @MessageBody() payload: ReconnectBalootPayload,
  ) {
    const parsed = schemas.reconnect.safeParse(payload);
    if (!parsed.success) return this.invalidPayload();
    if (!this.consume(client, 'reconnect', 30)) return this.rateLimited();
    return this.attach(client, await this.baloot.reconnect(parsed.data));
  }

  @SubscribeMessage('baloot:next-round')
  async nextRound(
    @ConnectedSocket() client: BalootSocket,
    @MessageBody() payload: NextRoundBalootPayload,
  ) {
    if (!schemas.start.safeParse(payload).success) return this.invalidPayload();
    if (!this.consume(client, 'action', 120)) return this.rateLimited();
    const identity = this.identity(client);
    if (!identity) return this.invalidSession();
    const result = await this.baloot.nextRound(
      identity.roomCode,
      identity.sessionToken,
    );
    if (result.ok) await this.broadcast(identity.roomCode);
    return result;
  }

  @SubscribeMessage('baloot:bid')
  async bid(
    @ConnectedSocket() client: BalootSocket,
    @MessageBody() payload: BidBalootPayload,
  ) {
    const parsed = schemas.bid.safeParse(payload);
    if (!parsed.success) return this.invalidPayload();
    if (!this.consume(client, 'action', 120)) return this.rateLimited();
    const identity = this.identity(client);
    if (!identity) return this.invalidSession();
    const result = await this.baloot.bid(
      identity.roomCode,
      identity.sessionToken,
      parsed.data,
    );
    if (result.ok) await this.broadcast(identity.roomCode);
    return result;
  }

  @SubscribeMessage('baloot:play-card')
  async playCard(
    @ConnectedSocket() client: BalootSocket,
    @MessageBody() payload: PlayBalootCardPayload,
  ) {
    const parsed = schemas.playCard.safeParse(payload);
    if (!parsed.success) return this.invalidPayload();
    if (!this.consume(client, 'action', 120)) return this.rateLimited();
    const identity = this.identity(client);
    if (!identity) return this.invalidSession();
    const result = await this.baloot.playCard(
      identity.roomCode,
      identity.sessionToken,
      parsed.data,
    );
    if (result.ok) await this.broadcast(identity.roomCode);
    return result;
  }

  @SubscribeMessage('baloot:leave')
  async leave(
    @ConnectedSocket() client: BalootSocket,
    @MessageBody() payload: LeaveBalootPayload,
  ) {
    if (!schemas.start.safeParse(payload ?? {}).success)
      return this.invalidPayload();
    const identity = this.identity(client);
    if (!identity) return this.invalidSession();
    await this.baloot.leave(identity.sessionToken);
    await this.detach(client, identity, false);
    await this.broadcast(identity.roomCode);
    return { ok: true as const, data: { left: true } };
  }

  async handleDisconnect(client: BalootSocket) {
    this.rateLimiter.clearSocket(client.id);
    const identity = this.identity(client);
    this.sockets.delete(client.id);
    if (!identity) return;
    await this.baloot.untrackSocket(identity.roomCode, client.id);
    const hasActiveSocket = [...this.sockets.values()].some(
      (candidate) => candidate.sessionToken === identity.sessionToken,
    );
    if (hasActiveSocket) return;
    this.queueDisconnect(identity);
  }

  private async attach(
    client: BalootSocket,
    result: BalootResult<BalootSession>,
  ) {
    if (!result.ok) return result;
    const { roomCode, sessionToken } = result.data;
    this.clearPendingDisconnect(sessionToken);
    client.data.balootRoomCode = roomCode;
    client.data.balootSessionToken = sessionToken;
    this.sockets.set(client.id, { roomCode, sessionToken });
    await client.join(roomCode);
    await this.baloot.trackSocket(roomCode, client.id, sessionToken);
    await this.broadcast(roomCode);
    return result;
  }

  private async detach(
    client: BalootSocket,
    identity: { roomCode: string; sessionToken: string },
    markDisconnected = true,
  ) {
    this.sockets.delete(client.id);
    delete client.data.balootRoomCode;
    delete client.data.balootSessionToken;
    await this.baloot.untrackSocket(identity.roomCode, client.id);
    try {
      await client.leave(identity.roomCode);
    } catch {
      /* socket already gone */
    }
    if (markDisconnected) await this.baloot.leave(identity.sessionToken);
  }

  private clearPendingDisconnect(sessionToken: string) {
    const timer = this.pendingDisconnects.get(sessionToken);
    if (!timer) return;
    clearTimeout(timer);
    this.pendingDisconnects.delete(sessionToken);
  }

  private queueDisconnect(identity: {
    roomCode: string;
    sessionToken: string;
  }) {
    this.clearPendingDisconnect(identity.sessionToken);
    const timer = setTimeout(() => {
      this.pendingDisconnects.delete(identity.sessionToken);
      const hasActiveSocket = [...this.sockets.values()].some(
        (candidate) => candidate.sessionToken === identity.sessionToken,
      );
      if (hasActiveSocket) return;
      void this.baloot
        .disconnect(identity.sessionToken)
        .then(() => this.broadcast(identity.roomCode));
    }, 8_000);
    this.pendingDisconnects.set(identity.sessionToken, timer);
  }

  private async broadcast(roomCode: string) {
    const tracked = new Map(this.sockets);
    for (const remote of await this.baloot.listRoomSockets(roomCode)) {
      if (!tracked.has(remote.socketId)) {
        tracked.set(remote.socketId, {
          roomCode,
          sessionToken: remote.sessionToken,
        });
      }
    }
    const recipients = [...tracked].filter(
      ([, identity]) => identity.roomCode === roomCode,
    );
    const snapshots = await this.baloot.getSnapshots(
      roomCode,
      recipients.map(([, identity]) => identity.sessionToken),
    );
    let latestSnapshot: BalootSnapshot | null = null;
    for (const [socketId, identity] of recipients) {
      const snapshot = snapshots.get(identity.sessionToken);
      if (snapshot) {
        latestSnapshot ??= snapshot;
        this.server.to(socketId).emit('baloot:state', snapshot);
      }
    }
    this.scheduleTurnTimeout(roomCode, latestSnapshot);
  }

  private scheduleTurnTimeout(
    roomCode: string,
    snapshot: BalootSnapshot | null,
  ) {
    const current = this.turnTimers.get(roomCode);
    if (current) clearTimeout(current);
    this.turnTimers.delete(roomCode);
    if (snapshot?.phase !== 'PLAYING' || snapshot.turn === null) return;
    const expectedVersion = snapshot.stateVersion;
    const expectedTurn = snapshot.turn;
    const timer = setTimeout(() => {
      this.turnTimers.delete(roomCode);
      void this.baloot
        .playTimedOutTurn(roomCode, expectedVersion, expectedTurn)
        .then((played) => (played ? this.broadcast(roomCode) : undefined));
    }, BALOOT_RULES.turnTimeoutMs);
    timer.unref?.();
    this.turnTimers.set(roomCode, timer);
  }

  private identity(client: BalootSocket) {
    return (
      this.sockets.get(client.id) ??
      (client.data.balootRoomCode && client.data.balootSessionToken
        ? {
            roomCode: client.data.balootRoomCode,
            sessionToken: client.data.balootSessionToken,
          }
        : null)
    );
  }

  private consume(client: BalootSocket, bucket: string, limit: number) {
    const socketAllowed = this.rateLimiter.consume(
      `socket:${client.id}:${bucket}`,
      limit,
      60_000,
    );
    if (!socketAllowed) return false;
    const address = client.handshake?.address?.trim();
    return address
      ? this.rateLimiter.consume(
          `address:${address}:${bucket}`,
          limit * 4,
          60_000,
        )
      : true;
  }

  private invalidSession() {
    return {
      ok: false as const,
      code: 'INVALID_SESSION',
      message: 'جلسة البلوت غير صالحة.',
    };
  }

  private invalidPayload() {
    return {
      ok: false as const,
      code: 'INVALID_PAYLOAD',
      message: 'بيانات الطلب غير صالحة.',
    };
  }

  private rateLimited() {
    return {
      ok: false as const,
      code: 'RATE_LIMITED',
      message: 'طلبات كثيرة خلال وقت قصير. انتظر ثم حاول مجدداً.',
    };
  }
}

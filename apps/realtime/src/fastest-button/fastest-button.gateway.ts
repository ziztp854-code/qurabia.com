import { Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { createHash } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import {
  fastestCodePayloadSchema,
  fastestCommandSchema,
  fastestJoinSchema,
  fastestPressSchema,
  fastestSettingsSchema,
  verifyFastestButtonHostAccessToken,
} from '@tahaddi/contracts';
import { FastestRuleError, type FastestRoom } from '@tahaddi/domain';
import {
  allowWebSocketOrigin,
  allowWebSocketRequest,
} from '../config/web-origins.js';
import { resolveTokenSecret } from '../config/token-secret.js';
import { RedisService } from '../game/redis.service.js';
import { SocketEventRateLimiter } from '../special-games/socket-event-rate-limiter.js';
import { FastestButtonService } from './fastest-button.service.js';
type Membership = {
  code: string;
  role: 'host' | 'player' | 'display';
  playerId?: string;
  hostId?: string;
};
const resumeSchema = z
  .object({
    code: z.string().regex(/^\d{6}$/),
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict();
@WebSocketGateway({
  namespace: '/fastest-button',
  cors: { origin: allowWebSocketOrigin, credentials: true },
  allowRequest: allowWebSocketRequest,
})
export class FastestButtonGateway
  implements OnGatewayInit, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(FastestButtonGateway.name);
  private readonly memberships = new Map<string, Membership>();
  private readonly rateLimiter = new SocketEventRateLimiter();
  private readonly broadcasts = new Map<
    string,
    {
      room: FastestRoom;
      promise: Promise<void>;
      resolve: () => void;
      reject: (error: unknown) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private closing = false;
  private timer?: ReturnType<typeof setInterval>;
  private ticking = false;
  private lastIdleSweep = 0;
  constructor(
    private readonly game: FastestButtonService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}
  afterInit() {
    this.timer = setInterval(() => {
      void this.sweep();
    }, 100);
    this.timer.unref?.();
  }
  onModuleDestroy() {
    this.closing = true;
    if (this.timer) clearInterval(this.timer);
    for (const entry of this.broadcasts.values()) {
      clearTimeout(entry.timer);
      entry.resolve();
    }
    this.broadcasts.clear();
  }
  async handleDisconnect(client: Socket) {
    this.rateLimiter.clearSocket(client.id);
    const member = this.memberships.get(client.id);
    this.memberships.delete(client.id);
    if (member?.playerId) {
      try {
        await this.publish(
          await this.game.presence(
            member.code,
            member.playerId,
            client.id,
            false,
          ),
        );
      } catch {
        /* A disconnected socket cannot receive errors. Lease expires on its own. */
      }
    }
  }
  private async sweep() {
    if (this.ticking) return;
    if (!this.memberships.size && Date.now() - this.lastIdleSweep < 5000)
      return;
    this.lastIdleSweep = Date.now();
    this.ticking = true;
    try {
      for (const code of await this.game.dueRooms()) {
        const room = await this.game.tick(code);
        if (room) await this.publish(room);
      }
    } catch {
      this.logger.warn(
        'Fastest-button deadline sweep unavailable; persistent deadlines will be retried.',
      );
    } finally {
      this.ticking = false;
    }
  }
  private host(client: Socket): string {
    const raw: unknown = client.handshake.auth?.hostToken;
    const payload =
      typeof raw === 'string'
        ? verifyFastestButtonHostAccessToken(
            resolveTokenSecret(this.config),
            raw,
          )
        : null;
    if (!payload)
      throw new FastestRuleError(
        'HOST_AUTH_REQUIRED',
        'سجّل الدخول من بوابة المضيف. انتهت الجلسة أو لا تملك تصريحًا.',
      );
    return payload.hostId;
  }
  private async run(
    client: Socket,
    event: string,
    action: () => Promise<void>,
  ) {
    const now = Date.now();
    const limit = event === 'press' ? 120 : event === 'create' ? 10 : 60;
    const subject = createHash('sha256')
      .update(client.handshake.address)
      .digest('hex');
    if (
      !this.rateLimiter.consume(
        `socket:${client.id}:${event}`,
        limit,
        60_000,
        now,
      ) ||
      !this.rateLimiter.consume(
        `ip:${subject}:${event}`,
        limit * 10,
        60_000,
        now,
      )
    ) {
      client.emit('fastest:error', {
        code: 'RATE_LIMITED',
        message: 'طلبات كثيرة. انتظر قليلًا.',
      });
      return;
    }
    try {
      // Redis failure is fail-closed: never fall back to per-process winners.
      if (
        (await this.redis.consumeRateLimit(
          `fastest:${subject}:${event}`,
          Math.min(limit * 10, 1000),
          60_000,
        )) !== true
      )
        throw new FastestRuleError(
          'RATE_LIMITED',
          'طلبات كثيرة أو تعذّر الوصول للخادم. انتظر قليلًا.',
        );
      await action();
    } catch (error) {
      const known = error instanceof FastestRuleError;
      client.emit('fastest:error', {
        code: known
          ? error.code
          : error instanceof z.ZodError
            ? 'INVALID_PAYLOAD'
            : 'SERVER_UNAVAILABLE',
        message: known
          ? error.message
          : error instanceof z.ZodError
            ? 'بيانات الطلب غير صالحة.'
            : 'تعذّر الوصول للخادم. لم تُحتسب نتيجة محلية؛ أعد المحاولة.',
      });
    }
  }
  private async attach(client: Socket, member: Membership) {
    const previous = this.memberships.get(client.id);
    if (
      previous &&
      (previous.code !== member.code || previous.playerId !== member.playerId)
    ) {
      await client.leave(previous.code);
      if (previous.playerId)
        await this.game.presence(
          previous.code,
          previous.playerId,
          client.id,
          false,
        );
    }
    await client.join(member.code);
    this.memberships.set(client.id, member);
  }
  private publish(room: FastestRoom): Promise<void> {
    if (this.closing) return Promise.resolve();
    const queued = this.broadcasts.get(room.code);
    if (queued) {
      if (room.revision >= queued.room.revision) queued.room = room;
      return queued.promise;
    }
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<void>((done, fail) => {
      resolve = done;
      reject = fail;
    });
    const timer = setTimeout(() => {
      void this.flushBroadcast(room.code);
    }, 50);
    timer.unref?.();
    this.broadcasts.set(room.code, { room, promise, resolve, reject, timer });
    return promise;
  }
  private async flushBroadcast(code: string) {
    const entry = this.broadcasts.get(code);
    if (!entry) return;
    this.broadcasts.delete(code);
    try {
      this.server
        .to(code)
        .emit(
          'fastest:state',
          this.game.snapshot(entry.room, await this.game.clock()),
        );
      entry.resolve();
    } catch (error) {
      entry.reject(error);
    }
  }
  @SubscribeMessage('fastest:create')
  async create(
    @ConnectedSocket() client: Socket,
    @MessageBody() input: unknown,
  ) {
    await this.run(client, 'create', async () => {
      const hostId = this.host(client);
      const room = await this.game.create(
        hostId,
        fastestSettingsSchema.parse(input),
      );
      await this.attach(client, { code: room.code, role: 'host', hostId });
      await this.publish(room);
    });
  }
  @SubscribeMessage('fastest:host')
  async restoreHost(
    @ConnectedSocket() client: Socket,
    @MessageBody() input: unknown,
  ) {
    await this.run(client, 'host', async () => {
      const { code } = fastestCodePayloadSchema.parse(input);
      const hostId = this.host(client);
      const room = await this.game.tick(code);
      if (!room || room.hostId !== hostId)
        throw new FastestRuleError('HOST_ONLY', 'هذه الغرفة ليست لحسابك.');
      await this.attach(client, { code, role: 'host', hostId });
      await this.publish(room);
    });
  }
  @SubscribeMessage('fastest:join')
  async join(@ConnectedSocket() client: Socket, @MessageBody() input: unknown) {
    await this.run(client, 'join', async () => {
      if (this.memberships.get(client.id)?.role === 'player')
        throw new FastestRuleError('ALREADY_JOINED', 'أنت داخل الغرفة بالفعل.');
      const { code, name } = fastestJoinSchema.parse(input);
      const { room, identity } = await this.game.join(code, name, client.id);
      await this.attach(client, {
        code,
        role: 'player',
        playerId: identity.playerId,
      });
      client.emit('fastest:identity', identity);
      await this.publish(room);
    });
  }
  @SubscribeMessage('fastest:resume')
  async resume(
    @ConnectedSocket() client: Socket,
    @MessageBody() input: unknown,
  ) {
    await this.run(client, 'resume', async () => {
      const { code, token } = resumeSchema.parse(input);
      const { room, playerId } = await this.game.resume(code, token, client.id);
      await this.attach(client, { code, role: 'player', playerId });
      client.emit('fastest:identity', { code, playerId, token });
      await this.publish(room);
    });
  }
  @SubscribeMessage('fastest:watch')
  async watch(
    @ConnectedSocket() client: Socket,
    @MessageBody() input: unknown,
  ) {
    await this.run(client, 'watch', async () => {
      const { code } = fastestCodePayloadSchema.parse(input);
      const room = await this.game.tick(code);
      if (!room)
        throw new FastestRuleError('ROOM_NOT_FOUND', 'الغرفة غير موجودة.');
      await this.attach(client, { code, role: 'display' });
      await this.publish(room);
    });
  }
  @SubscribeMessage('fastest:command')
  async command(
    @ConnectedSocket() client: Socket,
    @MessageBody() input: unknown,
  ) {
    await this.run(client, 'command', async () => {
      const { code, action, settings, playerId } =
        fastestCommandSchema.parse(input);
      const member = this.memberships.get(client.id);
      const hostId = this.host(client);
      if (
        member?.role !== 'host' ||
        member.code !== code ||
        member.hostId !== hostId
      )
        throw new FastestRuleError('HOST_ONLY', 'التحكم متاح للمضيف فقط.');
      await this.publish(
        await this.game.command(code, hostId, action, settings, playerId),
      );
    });
  }
  @SubscribeMessage('fastest:press')
  async press(
    @ConnectedSocket() client: Socket,
    @MessageBody() input: unknown,
  ) {
    await this.run(client, 'press', async () => {
      const { code, roundId } = fastestPressSchema.parse(input);
      const member = this.memberships.get(client.id);
      if (member?.role !== 'player' || member.code !== code || !member.playerId)
        throw new FastestRuleError('PLAYER_ONLY', 'انضم كلاعب أولًا.');
      try {
        await this.publish(
          await this.game.press(code, roundId, member.playerId, client.id),
        );
      } catch (error) {
        if (error instanceof FastestRuleError && error.code === 'TOO_LATE') {
          const expired = await this.game.tick(code);
          if (expired) await this.publish(expired);
        }
        throw error;
      }
    });
  }
  @SubscribeMessage('fastest:sync')
  async sync(@ConnectedSocket() client: Socket) {
    await this.run(client, 'sync', async () => {
      const member = this.memberships.get(client.id);
      if (!member) throw new FastestRuleError('NOT_JOINED', 'اختر غرفة أولًا.');
      const before = member.playerId
        ? await this.game.presence(
            member.code,
            member.playerId,
            client.id,
            true,
          )
        : await this.game.get(member.code);
      const room = await this.game.tick(member.code);
      if (!room) return;
      if (
        before &&
        (before.phase !== room.phase ||
          before.rounds.length !== room.rounds.length)
      ) {
        await this.publish(room);
      } else {
        client.emit(
          'fastest:state',
          this.game.snapshot(room, await this.game.clock()),
        );
      }
    });
  }
}

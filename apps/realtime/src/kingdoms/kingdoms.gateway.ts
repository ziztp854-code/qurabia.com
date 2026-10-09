import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { z } from 'zod';
import { allowWebSocketOrigin } from '../config/web-origins.js';
import { SocketEventRateLimiter } from '../special-games/socket-event-rate-limiter.js';

export const kingdomWorldId = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
const watchSchema = z.object({ worldId: kingdomWorldId }).strict();
const roomPrefix = 'kingdoms:world:';
export const kingdomHeartbeatIntervalMs = 5_000;
export const kingdomHeartbeatTimeoutMs = 20_000;
export const kingdomWatchedWorldLimit = 512;
const maxCachedWorlds = 1_024;

/** Public invalidation only. Private state always comes from the authorized web API. */
@WebSocketGateway({
  namespace: '/kingdoms',
  cors: { origin: allowWebSocketOrigin, credentials: true },
})
export class KingdomsGateway implements OnGatewayDisconnect {
  @WebSocketServer() server!: Namespace;
  private readonly limiter = new SocketEventRateLimiter();
  private readonly watches = new Map<string, string>();
  private readonly watchTokens = new Map<
    string,
    { token: symbol; worldId: string }
  >();
  private readonly revisions = new Map<string, number>();
  private lastHealthyTick: number | null = null;

  @SubscribeMessage('kingdoms:watch')
  async watch(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    if (
      !this.limiter.consume(`socket:${client.id}:kingdoms-watch`, 10, 60_000)
    ) {
      return { success: false };
    }
    const parsed = watchSchema.safeParse(body);
    if (!parsed.success) return { success: false };
    if (!this.canWatch(client.id, parsed.data.worldId))
      return { success: false };
    const token = Symbol();
    this.watchTokens.set(client.id, { token, worldId: parsed.data.worldId });
    for (const room of [...client.rooms]) {
      if (room.startsWith(roomPrefix)) await client.leave(room);
    }
    await client.join(`${roomPrefix}${parsed.data.worldId}`);
    if (this.watchTokens.get(client.id)?.token !== token) {
      if (this.watchTokens.get(client.id)?.worldId !== parsed.data.worldId)
        await client.leave(`${roomPrefix}${parsed.data.worldId}`);
      return { success: false };
    }
    if (!this.canWatch(client.id, parsed.data.worldId)) {
      await client.leave(`${roomPrefix}${parsed.data.worldId}`);
      this.watches.delete(client.id);
      this.watchTokens.delete(client.id);
      return { success: false };
    }
    this.watches.set(client.id, parsed.data.worldId);
    return {
      success: true,
      worldId: parsed.data.worldId,
      capability: 'revision-push-v1',
      live: this.isLive(),
      heartbeatIntervalMs: kingdomHeartbeatIntervalMs,
      heartbeatTimeoutMs: kingdomHeartbeatTimeoutMs,
    };
  }

  publishRevision(worldId: string, revision: number) {
    if (
      !kingdomWorldId.safeParse(worldId).success ||
      !Number.isSafeInteger(revision) ||
      revision < 0
    )
      return false;
    const previous = this.revisions.get(worldId);
    if (previous !== undefined && revision <= previous) return false;
    this.revisions.delete(worldId);
    this.revisions.set(worldId, revision);
    if (this.revisions.size > maxCachedWorlds) {
      for (const oldest of this.revisions.keys()) {
        this.revisions.delete(oldest);
        break;
      }
    }
    this.server
      ?.to(`${roomPrefix}${worldId}`)
      .emit('kingdoms:revision', { worldId, revision });
    return true;
  }

  setWorkerHealth(ready: boolean) {
    this.lastHealthyTick = ready ? Date.now() : null;
  }

  watchedWorldIds() {
    return [...new Set(this.watches.values())];
  }

  private canWatch(clientId: string, worldId: string) {
    const others = new Set<string>();
    for (const [id, watched] of this.watches)
      if (id !== clientId) others.add(watched);
    return others.has(worldId) || others.size < kingdomWatchedWorldLimit;
  }

  /** Duplicates prove worker/channel health without reading a player's state. */
  heartbeat() {
    if (!this.isLive()) return;
    for (const worldId of new Set(this.watches.values())) {
      this.server?.to(`${roomPrefix}${worldId}`).emit('kingdoms:revision', {
        worldId,
        revision: this.revisions.get(worldId) ?? 0,
      });
    }
  }

  private isLive() {
    return (
      this.lastHealthyTick !== null &&
      Date.now() - this.lastHealthyTick < kingdomHeartbeatTimeoutMs
    );
  }

  handleDisconnect(client: Socket) {
    this.limiter.clearSocket(client.id);
    this.watches.delete(client.id);
    this.watchTokens.delete(client.id);
  }
}

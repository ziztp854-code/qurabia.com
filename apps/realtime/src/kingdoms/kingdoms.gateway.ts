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

/** Public invalidation only. Private state always comes from the authorized web API. */
@WebSocketGateway({
  namespace: '/kingdoms',
  cors: { origin: allowWebSocketOrigin, credentials: true },
})
export class KingdomsGateway implements OnGatewayDisconnect {
  @WebSocketServer() server!: Namespace;
  private readonly limiter = new SocketEventRateLimiter();

  @SubscribeMessage('kingdoms:watch')
  async watch(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    if (
      !this.limiter.consume(`socket:${client.id}:kingdoms-watch`, 10, 60_000)
    ) {
      return { success: false };
    }
    const parsed = watchSchema.safeParse(body);
    if (!parsed.success) return { success: false };
    for (const room of client.rooms) {
      if (room.startsWith(roomPrefix)) await client.leave(room);
    }
    await client.join(`${roomPrefix}${parsed.data.worldId}`);
    return { success: true };
  }

  publishRevision(worldId: string, revision: number) {
    if (
      !kingdomWorldId.safeParse(worldId).success ||
      !Number.isSafeInteger(revision) ||
      revision < 0
    )
      return;
    this.server
      ?.to(`${roomPrefix}${worldId}`)
      .emit('kingdoms:revision', { worldId, revision });
  }

  handleDisconnect(client: Socket) {
    this.limiter.clearSocket(client.id);
  }
}

import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-streams-adapter';
import Redis from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';
import { closeRedisClient } from './redis-client-lifecycle.js';

const SOCKET_STREAM_NAME = 'tahaddi:socket.io';
const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on', 'enabled']);

export function shouldUseRedisStreamsAdapter(
  env: NodeJS.ProcessEnv = process.env,
) {
  const configured = env.SOCKET_IO_REDIS_STREAMS_ADAPTER?.trim().toLowerCase();
  if (configured) return TRUE_VALUES.has(configured);

  return Boolean(env.REDIS_URL?.trim());
}

export function shouldDisconnectRedisStreamsAdapterOnHttpClose(
  env: NodeJS.ProcessEnv = process.env,
) {
  return env.VERCEL !== '1';
}

function withConnectionStateRecovery(options?: ServerOptions): ServerOptions {
  return {
    ...options,
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1_000,
      skipMiddlewares: false,
      ...options?.connectionStateRecovery,
    },
  } as ServerOptions;
}

export class RealtimeIoAdapter extends IoAdapter {
  override createIOServer(port: number, options?: ServerOptions): Server {
    return super.createIOServer(
      port,
      withConnectionStateRecovery(options),
    ) as Server;
  }
}

export class RedisIoAdapter extends IoAdapter {
  private readonly redisClient: Redis;
  private readonly servers = new Set<Server>();

  constructor(app: INestApplicationContext, redisUrl: string) {
    super(app);
    this.redisClient = new Redis(redisUrl, {
      keepAlive: 30_000,
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });
    this.redisClient.on('error', (error: Error) => {
      console.error('[Socket.IO Redis] connection error:', error.message);
    });
  }

  async connect() {
    await this.redisClient.connect();
    await this.redisClient.ping();
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(
      port,
      withConnectionStateRecovery(options),
    ) as Server;
    server.adapter(
      createAdapter(this.redisClient, {
        streamName: SOCKET_STREAM_NAME,
        blockTimeInMs: 30_000,
      }),
    );
    this.servers.add(server);
    return server;
  }

  async disconnect() {
    await closeSocketIoServers(this.servers);
    this.servers.clear();
    await closeRedisClient(this.redisClient, 'Socket.IO Redis');
  }
}

export async function closeSocketIoServers(servers: Iterable<Server>) {
  await Promise.all(
    Array.from(
      servers,
      (server) =>
        new Promise<void>((resolve) => {
          let settled = false;
          const finish = () => {
            if (!settled) {
              settled = true;
              resolve();
            }
          };
          try {
            const closeResult = server.close(() => finish()) as unknown;
            if (
              closeResult &&
              typeof (closeResult as Promise<void>).then === 'function'
            ) {
              void Promise.resolve(closeResult).then(finish, finish);
            }
          } catch {
            finish();
          }
        }),
    ),
  );
}

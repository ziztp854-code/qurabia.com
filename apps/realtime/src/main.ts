import './instrument.js';
import { NestFactory } from '@nestjs/core';
import type { Express, Request, Response } from 'express';
import type { Server as HttpServer } from 'node:http';
import { AppModule } from './app.module';
import { AppService } from './app.service.js';
import {
  buildSecurityHeaders,
  createSecurityHeadersMiddleware,
} from './config/security-headers.js';
import { getAllowedWebOrigins } from './config/web-origins.js';
import { installRedisCloseRejectionHandler } from './redis-client-lifecycle.js';
import { captureException, flushSentry } from './observability/sentry.js';
import {
  RealtimeIoAdapter,
  RedisIoAdapter,
  shouldDisconnectRedisStreamsAdapterOnHttpClose,
  shouldUseRedisStreamsAdapter,
} from './redis-io.adapter.js';

installRedisCloseRejectionHandler('Socket.IO Redis');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const appService = app.get(AppService);
  const allowedOrigins = getAllowedWebOrigins();
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });
  const httpAdapter = app.getHttpAdapter();
  const server = httpAdapter.getInstance() as Express;
  server.use(
    createSecurityHeadersMiddleware(buildSecurityHeaders(allowedOrigins)),
  );
  server.get('/health', (_req: Request, res: Response) => {
    res.json(appService.getHealth());
  });
  app.setGlobalPrefix('realtime');
  app.enableShutdownHooks();

  let redisAdapter = shouldUseRedisStreamsAdapter()
    ? new RedisIoAdapter(app, process.env.REDIS_URL ?? 'redis://localhost:6379')
    : null;

  if (redisAdapter) {
    try {
      await redisAdapter.connect();
    } catch (error) {
      // A single-instance fallback still serves traffic, so never fail boot here.
      captureException(error);
      console.error(
        '[Socket.IO Redis] adapter unavailable, falling back to in-memory rooms:',
        error instanceof Error ? error.message : error,
      );
      await redisAdapter.disconnect().catch(() => undefined);
      redisAdapter = null;
    }
  }
  app.useWebSocketAdapter(redisAdapter ?? new RealtimeIoAdapter(app));

  const httpServer = app.getHttpServer() as HttpServer;
  httpServer.once('close', () => {
    if (!shouldDisconnectRedisStreamsAdapterOnHttpClose()) return;
    void redisAdapter?.disconnect().catch((error: unknown) => {
      console.error(
        '[Socket.IO Redis] shutdown error:',
        error instanceof Error ? error.message : error,
      );
    });
  });

  const port = Number(process.env.PORT ?? process.env.REALTIME_PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
}
void bootstrap().catch(async (error: unknown) => {
  captureException(error);
  console.error(
    '[Realtime] startup error:',
    error instanceof Error ? error.message : error,
  );
  await flushSentry();
  process.exitCode = 1;
});

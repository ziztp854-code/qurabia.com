import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { KingdomsGateway, kingdomWorldId } from './kingdoms.gateway.js';

const tickResult = z.object({
  success: z.literal(true),
  data: z.object({
    worlds: z
      .array(
        z.object({
          id: kingdomWorldId,
          revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
        }),
      )
      .max(10),
  }),
});

export function kingdomWorkerEndpoint(
  origin: string | undefined,
  production = false,
) {
  if (!origin) return null;
  try {
    const url = new URL(origin);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      return null;
    if (production && url.protocol !== 'https:') return null;
    return new URL('/api/internal/kingdoms/tick/', url).toString();
  } catch {
    return null;
  }
}

/** Polls the durable DB queue through the web service; timers contain no game state. */
@Injectable()
export class KingdomsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KingdomsWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private controller?: AbortController;
  private inFlight = false;
  private stopped = false;
  private readonly endpoint: string | null;
  private readonly secret: string | undefined;

  constructor(
    config: ConfigService,
    private readonly gateway: KingdomsGateway,
  ) {
    this.endpoint = kingdomWorkerEndpoint(
      config.get<string>('KINGDOMS_WEB_ORIGIN'),
      config.get<string>('NODE_ENV') === 'production',
    );
    this.secret = config.get<string>('KINGDOMS_WORKER_SECRET');
  }

  onModuleInit() {
    if (!this.endpoint || !this.secret || this.secret.length < 32) return;
    this.timer = setInterval(() => void this.tick(), 5_000);
    this.timer.unref();
    void this.tick();
  }

  async tick() {
    if (
      this.stopped ||
      this.inFlight ||
      !this.endpoint ||
      !this.secret ||
      this.secret.length < 32
    )
      return;
    this.inFlight = true;
    const controller = new AbortController();
    this.controller = controller;
    const timeout = setTimeout(() => controller.abort(), 10_000);
    timeout.unref();
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.secret}`,
        },
        body: JSON.stringify({ limit: 10 }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('Tick request failed');
      const parsed = tickResult.safeParse(await response.json());
      if (!parsed.success) throw new Error('Invalid tick response');
      if (this.stopped) return;
      for (const world of parsed.data.data.worlds)
        this.gateway.publishRevision(world.id, world.revision);
    } catch {
      // No upstream bodies/URLs/tokens in logs. The durable queue is retried next poll.
      if (!this.stopped)
        this.logger.warn(
          'Kingdoms event processing failed; pending events will be retried.',
        );
    } finally {
      clearTimeout(timeout);
      this.controller = undefined;
      this.inFlight = false;
    }
  }

  onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.controller?.abort();
  }
}

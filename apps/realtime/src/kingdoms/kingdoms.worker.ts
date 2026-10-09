import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import {
  KingdomsGateway,
  kingdomHeartbeatIntervalMs,
  kingdomWatchedWorldLimit,
  kingdomWorldId,
} from './kingdoms.gateway.js';

export const kingdomDeadline = z
  .number()
  .int()
  .nonnegative()
  .max(8_640_000_000_000_000)
  .nullable();

const revisionMetadata = z
  .object({
    id: kingdomWorldId,
    revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

const tickResult = z.object({
  success: z.literal(true),
  data: z.object({
    nextEventAt: kingdomDeadline.optional(),
    revisions: z
      .array(revisionMetadata)
      .max(kingdomWatchedWorldLimit)
      .optional(),
    realtime: z
      .object({
        capability: z.literal('revision-push-v1'),
        notificationsConfigured: z.boolean(),
      })
      .optional(),
    worlds: z.array(revisionMetadata).max(10),
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
  private deadlineTimer?: ReturnType<typeof setTimeout>;
  private deadlineAt: number | null = null;
  private deadlineVersion = 0;
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
    this.timer = setInterval(
      () => void this.tick(),
      kingdomHeartbeatIntervalMs,
    );
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
    const deadlineVersion = this.deadlineVersion;
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
        body: JSON.stringify({
          limit: 10,
          watchedWorldIds: this.gateway.watchedWorldIds(),
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('Tick request failed');
      const parsed = tickResult.safeParse(await response.json());
      if (!parsed.success) throw new Error('Invalid tick response');
      if (this.stopped) return;
      this.gateway.setWorkerHealth(
        parsed.data.data.realtime?.notificationsConfigured === true &&
          parsed.data.data.revisions !== undefined,
      );
      for (const world of parsed.data.data.worlds)
        this.gateway.publishRevision(world.id, world.revision);
      // One central metadata batch recovers committed commands whose notify was lost.
      for (const world of parsed.data.data.revisions ?? [])
        this.gateway.publishRevision(world.id, world.revision);
      this.gateway.heartbeat();
      if (parsed.data.data.nextEventAt !== undefined) {
        if (deadlineVersion === this.deadlineVersion)
          this.replaceDeadline(parsed.data.data.nextEventAt);
        else this.scheduleDeadline(parsed.data.data.nextEventAt);
      }
    } catch {
      this.gateway.setWorkerHealth(false);
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

  /** One central acceleration timer; the persisted queue remains authoritative. */
  scheduleDeadline(nextEventAt: number | null) {
    if (!kingdomDeadline.safeParse(nextEventAt).success || this.stopped) return;
    this.deadlineVersion++;
    if (
      nextEventAt !== null &&
      (this.deadlineAt === null || nextEventAt < this.deadlineAt)
    )
      this.replaceDeadline(nextEventAt);
  }

  private replaceDeadline(nextEventAt: number | null) {
    if (this.deadlineTimer) clearTimeout(this.deadlineTimer);
    this.deadlineTimer = undefined;
    this.deadlineAt = nextEventAt;
    if (
      nextEventAt === null ||
      this.stopped ||
      !this.endpoint ||
      !this.secret ||
      this.secret.length < 32
    )
      return;
    const remaining = nextEventAt - Date.now();
    // Avoid overflowing Node timers and spinning on an already-due busy world.
    const delay = Math.min(2_147_483_647, remaining <= 0 ? 1_000 : remaining);
    this.deadlineTimer = setTimeout(() => {
      this.deadlineTimer = undefined;
      if (nextEventAt > Date.now()) this.replaceDeadline(nextEventAt);
      else {
        this.deadlineAt = null;
        void this.tick();
      }
    }, delay);
    this.deadlineTimer.unref();
  }

  onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    if (this.deadlineTimer) clearTimeout(this.deadlineTimer);
    this.gateway.setWorkerHealth(false);
    this.controller?.abort();
  }
}

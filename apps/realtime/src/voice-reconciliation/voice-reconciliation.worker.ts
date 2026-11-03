import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const batchSize = 10;
const pollIntervalMs = 5_000;
const requestTimeoutMs = 55_000;
const readinessMaxAgeMs = requestTimeoutMs + 2 * pollIntervalMs;
const backlogResult = z
  .object({
    accountPending: z.number().int().nonnegative(),
    roomPending: z.number().int().nonnegative(),
    accountDelayed: z.number().int().nonnegative(),
    roomDelayed: z.number().int().nonnegative(),
    oldestAgeSeconds: z.number().nonnegative().nullable(),
  })
  .refine(
    (value) =>
      value.accountDelayed <= value.accountPending &&
      value.roomDelayed <= value.roomPending &&
      (value.accountPending + value.roomPending === 0) ===
        (value.oldestAgeSeconds === null),
  );
const tickResult = z.object({
  success: z.literal(true),
  data: z.object({
    processed: z.number().int().min(0).max(batchSize),
    failed: z.number().int().min(0).max(batchSize),
    backlog: backlogResult,
  }),
});

export function voiceReconciliationEndpoint(
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
      url.hash ||
      (production && url.protocol !== 'https:')
    )
      return null;
    return new URL('/api/internal/voice/reconcile/', url).toString();
  } catch {
    return null;
  }
}

/** Schedules attempts only; durable reconciliation state belongs to the web database. */
@Injectable()
export class VoiceReconciliationWorker
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(VoiceReconciliationWorker.name);
  private readonly processInstanceId = randomUUID();
  private readonly endpoint: string | null;
  private readonly secret: string | undefined;
  private timer?: ReturnType<typeof setInterval>;
  private controller?: AbortController;
  private inFlight = false;
  private stopped = false;
  private lastSuccessAt?: number;
  private lastAttemptFailed = false;
  private consecutiveSuccesses = 0;
  private successSequence = 0;
  private backlogEmpty = false;

  constructor(config: ConfigService) {
    this.endpoint = voiceReconciliationEndpoint(
      config.get<string>('VOICE_RECONCILE_WEB_ORIGIN'),
      config.get<string>('NODE_ENV') === 'production',
    );
    this.secret = config.get<string>('VOICE_RECONCILE_SECRET');
  }

  onModuleInit() {
    if (!this.endpoint || !this.secret || this.secret.length < 32) {
      this.logger.warn(
        'Voice reconciliation worker is disabled: configure its origin and secret.',
      );
      return;
    }
    this.timer = setInterval(() => void this.tick(), pollIntervalMs);
    this.timer.unref();
    void this.tick();
  }

  /** This is voice-only readiness, not the realtime service health. */
  getReadiness() {
    return {
      ...this.getReadinessState(),
      processInstanceId: this.processInstanceId,
      lastSuccessAtMs: this.lastSuccessAt ?? null,
      successSequence: this.successSequence,
    };
  }

  private getReadinessState() {
    if (this.stopped) return { ready: false, state: 'stopped' } as const;
    if (!this.endpoint || !this.secret || this.secret.length < 32)
      return { ready: false, state: 'misconfigured' } as const;
    if (!this.timer) return { ready: false, state: 'starting' } as const;
    if (this.lastAttemptFailed)
      return { ready: false, state: 'retrying' } as const;
    if (this.lastSuccessAt === undefined)
      return { ready: false, state: 'starting' } as const;
    if (Date.now() - this.lastSuccessAt > readinessMaxAgeMs)
      return { ready: false, state: 'stale' } as const;
    if (!this.backlogEmpty)
      return {
        ready: false,
        state: 'backlog_pending',
        connectivity: 'connected',
      } as const;
    if (this.consecutiveSuccesses < 2)
      return { ready: false, state: 'starting' } as const;
    return { ready: true, state: 'ready' } as const;
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
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    timeout.unref();
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.secret}`,
        },
        body: JSON.stringify({ limit: batchSize }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('Voice reconciliation request failed');
      const parsed = tickResult.safeParse(await response.json());
      if (!parsed.success || parsed.data.data.failed > 0)
        throw new Error('Voice reconciliation incomplete');
      const backlog = parsed.data.data.backlog;
      this.backlogEmpty =
        backlog.accountPending === 0 &&
        backlog.roomPending === 0 &&
        backlog.accountDelayed === 0 &&
        backlog.roomDelayed === 0;
      this.lastSuccessAt = Date.now();
      this.successSequence += 1;
      this.lastAttemptFailed = false;
      this.consecutiveSuccesses = this.backlogEmpty
        ? this.consecutiveSuccesses + 1
        : 0;
    } catch {
      // Do not log upstream response bodies, request URLs, or bearer credentials.
      if (!this.stopped) {
        this.lastAttemptFailed = true;
        this.consecutiveSuccesses = 0;
        this.logger.warn(
          'Voice reconciliation did not complete; it will be retried.',
        );
      }
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

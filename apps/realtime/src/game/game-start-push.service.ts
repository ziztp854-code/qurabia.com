import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { DatabaseService } from './database.service.js';
import {
  RedisService,
  type GameStartPushDispatchJob,
  type GameStartPushJob,
  type GameStartPushReceiptJob,
} from './redis.service.js';

const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const EXPO_SEND_BATCH_SIZE = 100;
const EXPO_RECEIPT_BATCH_SIZE = 1_000;
const PUSH_TTL_SECONDS = 15 * 60;
const PUSH_FRESHNESS_MS = PUSH_TTL_SECONDS * 1_000;
const RECEIPT_DELAY_MS = 15 * 60 * 1_000;
const SWEEP_INTERVAL_MS = 30_000;
const SWEEP_JOB_LIMIT = 1;
const JOB_LEASE_MS = 10 * 60 * 1_000;
const MAX_SEND_ATTEMPTS = 3;
const SEND_RETRY_BASE_DELAY_MS = 500;
const QUEUE_RETRY_BASE_DELAY_MS = 30_000;
const MAX_QUEUE_RETRY_DELAY_MS = 5 * 60 * 1_000;
const REQUEST_TIMEOUT_MS = 10_000;

type GameStartPushInput = { sessionId: string; roomCode: string };
type ExpoTicket = {
  status?: unknown;
  id?: unknown;
  details?: { error?: unknown };
};
type ExpoReceipt = {
  status?: unknown;
  details?: { error?: unknown };
};

export type GameStartPushResult = {
  claimed: boolean;
  attempted: number;
  disabled: number;
};

class RetryableExpoError extends Error {
  override readonly name = 'RetryableExpoError';
}

class NonRetryableExpoError extends Error {
  override readonly name = 'NonRetryableExpoError';
}

function batches<T>(values: readonly T[], size: number) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size),
  );
}

function errorKind(error: unknown) {
  return error instanceof Error ? error.name : 'UnknownError';
}

function expoErrorCode(value: ExpoTicket | ExpoReceipt | undefined) {
  return typeof value?.details?.error === 'string'
    ? value.details.error
    : 'UnknownExpoError';
}

function retryDelay(attempt: number) {
  return Math.min(
    MAX_QUEUE_RETRY_DELAY_MS,
    QUEUE_RETRY_BASE_DELAY_MS * 2 ** Math.min(attempt, 4),
  );
}

@Injectable()
export class GameStartPushService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GameStartPushService.name);
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.sweepTimer = setInterval(() => {
      void this.reconcileAndProcessDueJobs().catch((error: unknown) => {
        this.logger.warn({
          event: 'game_start_push_sweep_failed',
          errorKind: errorKind(error),
        });
      });
    }, SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
    void this.reconcileAndProcessDueJobs().catch((error: unknown) => {
      this.logger.warn({
        event: 'game_start_push_recovery_failed',
        errorKind: errorKind(error),
      });
    });
  }

  onModuleDestroy() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
  }

  async notifyGameStarted(
    input: GameStartPushInput,
  ): Promise<GameStartPushResult> {
    const claimed = await this.redis.enqueueGameStartPushDispatch(
      input.sessionId,
      input.roomCode,
    );
    if (!claimed) return { claimed: false, attempted: 0, disabled: 0 };
    const processed = await this.processDueJobs();
    return { claimed: true, ...processed };
  }

  async reconcileAndProcessDueJobs() {
    const now = Date.now();
    try {
      const sessions = await this.database.client.liveSession.findMany({
        where: {
          status: 'ACTIVE',
          startedAt: {
            gte: new Date(now - PUSH_FRESHNESS_MS),
            lte: new Date(now + 5_000),
          },
        },
        select: { id: true, roomCode: true, startedAt: true },
        orderBy: { startedAt: 'asc' },
      });
      await Promise.all(
        sessions.flatMap((session) =>
          session.startedAt
            ? [
                this.redis.enqueueGameStartPushDispatch(
                  session.id,
                  session.roomCode,
                  session.startedAt.getTime(),
                ),
              ]
            : [],
        ),
      );
    } catch (error) {
      this.logger.warn({
        event: 'game_start_push_reconciliation_failed',
        errorKind: errorKind(error),
      });
    }
    return this.processDueJobs();
  }

  async processDueJobs(): Promise<{ attempted: number; disabled: number }> {
    const now = Date.now();
    const claimedUntil = now + JOB_LEASE_MS;
    const jobs = await this.redis.claimDueGameStartPushJobs(
      now,
      SWEEP_JOB_LIMIT,
      claimedUntil,
    );
    let attempted = 0;
    let disabled = 0;
    const receipts: GameStartPushReceiptJob[] = [];

    for (const job of jobs) {
      if (job.kind === 'receipt') {
        receipts.push(job);
        continue;
      }
      const result = await this.processDispatch(job, claimedUntil).catch(
        async (error: unknown) => {
          this.logger.warn({
            event: 'game_start_push_dispatch_job_failed',
            sessionId: job.sessionId,
            errorKind: errorKind(error),
          });
          await this.requeue(job);
          return { attempted: 0, disabled: 0 };
        },
      );
      attempted += result.attempted;
      disabled += result.disabled;
    }

    for (const receiptBatch of batches(receipts, EXPO_RECEIPT_BATCH_SIZE)) {
      disabled += await this.processReceipts(receiptBatch, claimedUntil);
    }
    return { attempted, disabled };
  }

  private async processDispatch(
    job: GameStartPushDispatchJob,
    initialLeaseUntil: number,
  ) {
    let expectedLeaseUntil = initialLeaseUntil;
    if (
      job.expiresAt <= Date.now() ||
      Date.now() - job.createdAt > PUSH_FRESHNESS_MS
    ) {
      this.logger.warn({
        event: 'game_start_push_dispatch_expired',
        sessionId: job.sessionId,
      });
      await this.redis.completeGameStartPushJob(job.id, true, job.expiresAt);
      return { attempted: 0, disabled: 0 };
    }

    if (job.disableTokens?.length) {
      try {
        await this.disableTokens(job.disableTokens);
      } catch (error) {
        this.logger.warn({
          event: 'game_start_push_disable_failed',
          deviceCount: job.disableTokens.length,
          errorKind: errorKind(error),
        });
        await this.requeue(job);
        return { attempted: 0, disabled: 0 };
      }
    }

    const tokens = job.tokens ?? (await this.registeredParticipantTokens(job));
    const uniqueTokens = [
      ...new Set(tokens.map((token) => token.trim())),
    ].filter(Boolean);
    if (uniqueTokens.length === 0) {
      await this.redis.completeGameStartPushJob(job.id, true, job.expiresAt);
      return { attempted: 0, disabled: job.disableTokens?.length ?? 0 };
    }

    let attempted = 0;
    let disabled = job.disableTokens?.length ?? 0;
    const rateLimitedTokens: string[] = [];
    for (
      let offset = 0;
      offset < uniqueTokens.length;
      offset += EXPO_SEND_BATCH_SIZE
    ) {
      const tokenBatch = uniqueTokens.slice(
        offset,
        offset + EXPO_SEND_BATCH_SIZE,
      );
      const nextLeaseUntil = Date.now() + JOB_LEASE_MS;
      const leaseRenewed = await this.redis.renewGameStartPushJobLease(
        job.id,
        expectedLeaseUntil,
        nextLeaseUntil,
      );
      if (!leaseRenewed) {
        this.logger.warn({
          event: 'game_start_push_lease_lost',
          jobKind: job.kind,
        });
        return { attempted, disabled };
      }
      expectedLeaseUntil = nextLeaseUntil;
      let tickets: ExpoTicket[];
      try {
        tickets = await this.sendBatch(tokenBatch, job);
      } catch (error) {
        this.logger.warn({
          event: 'game_start_push_send_failed',
          sessionId: job.sessionId,
          batchSize: tokenBatch.length,
          errorKind: errorKind(error),
        });
        if (error instanceof NonRetryableExpoError) {
          await this.redis.completeGameStartPushJob(
            job.id,
            true,
            job.expiresAt,
          );
          return { attempted, disabled };
        }
        await this.requeue({
          ...job,
          tokens: [...rateLimitedTokens, ...uniqueTokens.slice(offset)],
          disableTokens: [],
        });
        return { attempted, disabled };
      }
      attempted += tokenBatch.length;

      const invalidTokens: string[] = [];
      const receipts: Array<{ ticketId: string; token: string }> = [];
      tokenBatch.forEach((token, index) => {
        const ticket = tickets[index];
        if (ticket?.status === 'ok' && typeof ticket.id === 'string') {
          receipts.push({ ticketId: ticket.id, token });
          return;
        }
        if (ticket?.status === 'error') {
          const errorCode = expoErrorCode(ticket);
          if (errorCode === 'DeviceNotRegistered') invalidTokens.push(token);
          else if (errorCode === 'MessageRateExceeded')
            rateLimitedTokens.push(token);
          else this.logExpoError('ticket', errorCode);
          return;
        }
        rateLimitedTokens.push(token);
        this.logExpoError('ticket', 'MalformedExpoTicket');
      });

      if (receipts.length > 0) {
        await this.redis.enqueueGameStartPushReceipts(
          receipts.map((receipt) => ({
            ...receipt,
            sessionId: job.sessionId,
            roomCode: job.roomCode,
            createdAt: job.createdAt,
            expiresAt: job.expiresAt,
          })),
          Date.now() + RECEIPT_DELAY_MS,
        );
      }
      if (invalidTokens.length > 0) {
        try {
          await this.disableTokens(invalidTokens);
          disabled += invalidTokens.length;
        } catch (error) {
          this.logger.warn({
            event: 'game_start_push_disable_failed',
            deviceCount: invalidTokens.length,
            errorKind: errorKind(error),
          });
          await this.requeue({
            ...job,
            tokens: [
              ...rateLimitedTokens,
              ...uniqueTokens.slice(offset + EXPO_SEND_BATCH_SIZE),
            ],
            disableTokens: invalidTokens,
          });
          return { attempted, disabled };
        }
      }
    }

    if (rateLimitedTokens.length > 0) {
      await this.requeue({
        ...job,
        tokens: rateLimitedTokens,
        disableTokens: [],
      });
    } else {
      await this.redis.completeGameStartPushJob(job.id, true, job.expiresAt);
    }
    return { attempted, disabled };
  }

  private async processReceipts(
    jobs: GameStartPushReceiptJob[],
    expectedLeaseUntil: number,
  ) {
    const nextLeaseUntil = Date.now() + JOB_LEASE_MS;
    const renewals = await Promise.all(
      jobs.map((job) =>
        this.redis.renewGameStartPushJobLease(
          job.id,
          expectedLeaseUntil,
          nextLeaseUntil,
        ),
      ),
    );
    if (renewals.some((renewed) => !renewed)) {
      this.logger.warn({
        event: 'game_start_push_lease_lost',
        jobKind: 'receipt',
      });
      return 0;
    }
    let receiptData: Record<string, ExpoReceipt>;
    try {
      receiptData = await this.fetchReceipts(jobs.map((job) => job.ticketId));
    } catch (error) {
      this.logger.warn({
        event: 'game_start_push_receipts_failed',
        receiptCount: jobs.length,
        errorKind: errorKind(error),
      });
      if (error instanceof NonRetryableExpoError) {
        await Promise.all(
          jobs.map((job) => this.redis.completeGameStartPushJob(job.id, false)),
        );
        return 0;
      }
      await Promise.all(jobs.map((job) => this.requeue(job)));
      return 0;
    }

    const invalidJobs: GameStartPushReceiptJob[] = [];
    let disabled = 0;
    for (const job of jobs) {
      const receipt = receiptData[job.ticketId];
      if (!receipt) {
        await this.requeue(job);
        continue;
      }
      if (receipt.status === 'ok') {
        await this.redis.completeGameStartPushJob(job.id, false);
        continue;
      }
      if (receipt.status === 'error') {
        const errorCode = expoErrorCode(receipt);
        if (errorCode === 'DeviceNotRegistered') {
          invalidJobs.push(job);
        } else if (errorCode === 'MessageRateExceeded') {
          await this.requeue(this.receiptAsDispatch(job));
        } else {
          this.logExpoError('receipt', errorCode);
          await this.redis.completeGameStartPushJob(job.id, false);
        }
        continue;
      }
      this.logExpoError('receipt', 'MalformedExpoReceipt');
      await this.requeue(job);
    }

    if (invalidJobs.length > 0) {
      try {
        await this.disableTokens(invalidJobs.map((job) => job.token));
        disabled += invalidJobs.length;
        await Promise.all(
          invalidJobs.map((job) =>
            this.redis.completeGameStartPushJob(job.id, false),
          ),
        );
      } catch (error) {
        this.logger.warn({
          event: 'game_start_push_disable_failed',
          deviceCount: invalidJobs.length,
          errorKind: errorKind(error),
        });
        await Promise.all(invalidJobs.map((job) => this.requeue(job)));
      }
    }
    return disabled;
  }

  private registeredParticipantTokens(job: GameStartPushDispatchJob) {
    return this.database.client.mobilePushDevice
      .findMany({
        where: {
          enabled: true,
          user: {
            is: {
              status: 'ACTIVE',
              liveParticipations: { some: { sessionId: job.sessionId } },
            },
          },
        },
        select: { expoPushToken: true },
        orderBy: { id: 'asc' },
      })
      .then((devices) => devices.map((device) => device.expoPushToken));
  }

  private async sendBatch(tokens: string[], job: GameStartPushDispatchJob) {
    const topicId = `game-start-${createHash('sha256')
      .update(job.sessionId)
      .digest('hex')
      .slice(0, 32)}`;
    const messages = tokens.map((to) => ({
      to,
      sound: 'default',
      priority: 'high',
      ttl: PUSH_TTL_SECONDS,
      collapseId: topicId,
      threadId: topicId,
      title: 'بدأ التحدي',
      body: 'بدأ المضيف اللعبة. انضم الآن!',
      data: { type: 'join_room', roomCode: job.roomCode },
    }));
    const payload = await this.postJson(EXPO_SEND_URL, messages);
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('data' in payload) ||
      !Array.isArray(payload.data)
    ) {
      throw new NonRetryableExpoError('Expo returned malformed tickets');
    }
    return payload.data as ExpoTicket[];
  }

  private async fetchReceipts(ids: string[]) {
    const payload = await this.postJson(EXPO_RECEIPTS_URL, { ids });
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('data' in payload) ||
      typeof payload.data !== 'object' ||
      payload.data === null
    ) {
      throw new NonRetryableExpoError('Expo returned malformed receipts');
    }
    return payload.data as Record<string, ExpoReceipt>;
  }

  private receiptAsDispatch(
    job: GameStartPushReceiptJob,
  ): GameStartPushDispatchJob {
    return {
      id: job.id,
      kind: 'dispatch',
      sessionId: job.sessionId,
      roomCode: job.roomCode,
      tokens: [job.token],
      attempt: job.attempt,
      createdAt: job.createdAt,
      expiresAt: job.expiresAt,
      dueAt: job.dueAt,
    };
  }

  private async requeue(job: GameStartPushJob) {
    const nextAttempt = job.attempt + 1;
    await this.redis.requeueGameStartPushJob(
      { ...job, attempt: nextAttempt },
      Date.now() + retryDelay(nextAttempt),
    );
  }

  private logExpoError(source: 'ticket' | 'receipt', errorCode: string) {
    this.logger.warn({
      event: 'game_start_push_provider_error',
      source,
      errorCode,
    });
  }

  private async disableTokens(tokens: string[]) {
    if (tokens.length === 0) return;
    await this.database.client.mobilePushDevice.updateMany({
      where: {
        enabled: true,
        expoPushToken: { in: [...new Set(tokens)] },
      },
      data: { enabled: false, lastSeenAt: new Date() },
    });
  }

  private async postJson(url: string, body: unknown): Promise<unknown> {
    for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt += 1) {
      try {
        return await this.postJsonOnce(url, body);
      } catch (error) {
        if (
          !(error instanceof RetryableExpoError) ||
          attempt >= MAX_SEND_ATTEMPTS
        ) {
          throw error;
        }
        await this.wait(SEND_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
      }
    }
    throw new RetryableExpoError('Expo retry budget exhausted');
  }

  private async postJsonOnce(url: string, body: unknown): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    timeout.unref();
    const accessToken = this.config.get<string>('EXPO_ACCESS_TOKEN')?.trim();
    try {
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(accessToken
              ? { Authorization: `Bearer ${accessToken}` }
              : undefined),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (error) {
        throw new RetryableExpoError('Expo network request failed', {
          cause: error,
        });
      }
      if (!response.ok) {
        const ErrorType =
          response.status === 429 || response.status >= 500
            ? RetryableExpoError
            : NonRetryableExpoError;
        throw new ErrorType(
          `Expo request failed with status ${response.status}`,
        );
      }
      try {
        return (await response.json()) as unknown;
      } catch (error) {
        throw new NonRetryableExpoError('Expo returned invalid JSON', {
          cause: error,
        });
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private wait(delay: number) {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, delay);
      timer.unref();
    });
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { KingdomsGateway, kingdomWorldId } from './kingdoms.gateway.js';
import { KingdomsWorker, kingdomDeadline } from './kingdoms.worker.js';

const revisionNotification = z.union([
  z
    .object({
      worldId: kingdomWorldId,
      revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      nextEventAt: kingdomDeadline,
    })
    .strict(),
  z
    .object({
      capability: z.literal('revision-push-v1'),
      probe: z.literal(true),
    })
    .strict(),
]);

/** Existing service-to-service secret; no game payload is broadcast to rooms. */
@Controller('kingdoms')
export class KingdomsController {
  constructor(
    private readonly config: ConfigService,
    private readonly gateway: KingdomsGateway,
    private readonly worker: KingdomsWorker,
  ) {}

  @Post('revision')
  @HttpCode(200)
  revision(
    @Headers('authorization') authorization: string | undefined,
    @Body() input: unknown,
  ) {
    const secret = this.config.get<string>('KINGDOMS_WORKER_SECRET');
    if (!secret || secret.length < 32)
      throw new ServiceUnavailableException(
        'Kingdoms notifications unavailable',
      );
    const expected = Buffer.from(`Bearer ${secret}`);
    const supplied = Buffer.from(authorization ?? '');
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      throw new UnauthorizedException('Unauthorized');
    const parsed = revisionNotification.safeParse(input);
    if (!parsed.success) throw new BadRequestException('Invalid notification');
    if ('probe' in parsed.data)
      return { success: true, capability: 'revision-push-v1' };
    if (this.gateway.publishRevision(parsed.data.worldId, parsed.data.revision))
      this.worker.scheduleDeadline(parsed.data.nextEventAt);
    return { success: true };
  }
}

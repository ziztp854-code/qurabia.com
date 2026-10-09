import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { KingdomsGateway } from './kingdoms.gateway.js';
import type { KingdomsWorker } from './kingdoms.worker.js';
import { KingdomsController } from './kingdoms.controller.js';

describe('Kingdoms after-commit notification endpoint', () => {
  const secret = 'isolated-worker-secret-at-least-32-characters';
  const publish = jest.fn();
  const schedule = jest.fn();
  const payload = { worldId: 'world-1', revision: 4, nextEventAt: 10_000 };
  const controller = (configured: string | undefined = secret) =>
    new KingdomsController(
      { get: () => configured } as unknown as ConfigService,
      { publishRevision: publish } as unknown as KingdomsGateway,
      { scheduleDeadline: schedule } as unknown as KingdomsWorker,
    );
  beforeEach(() => {
    publish.mockReset().mockReturnValue(true);
    schedule.mockReset();
  });

  it('requires a configured existing secret before accepting any body', () => {
    for (const configured of ['', 'short'])
      expect(() =>
        controller(configured).revision(`Bearer ${configured}`, payload),
      ).toThrow(ServiceUnavailableException);
    expect(publish).not.toHaveBeenCalled();
  });

  it('rejects missing, incorrect and malformed bearer authorization', () => {
    for (const authorization of [
      undefined,
      `bearer ${secret}`,
      `Bearer ${'x'.repeat(secret.length)}`,
      `Bearer ${secret} `,
    ])
      expect(() => controller().revision(authorization, payload)).toThrow(
        UnauthorizedException,
      );
    expect(publish).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('strictly validates IDs, safe revisions and finite UTC deadlines before publishing', () => {
    for (const input of [
      { ...payload, worldId: '../world' },
      { ...payload, revision: -1 },
      { ...payload, revision: Number.MAX_SAFE_INTEGER + 1 },
      { ...payload, nextEventAt: Number.NaN },
      { ...payload, nextEventAt: Number.POSITIVE_INFINITY },
      { ...payload, nextEventAt: -1 },
      { ...payload, nextEventAt: 8_640_000_000_000_001 },
      { ...payload, troops: { guard: 500 } },
      { worldId: 'world-1', revision: 4 },
    ])
      expect(() => controller().revision(`Bearer ${secret}`, input)).toThrow(
        BadRequestException,
      );
    expect(publish).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('publishes revision only and schedules the trusted internal deadline', () => {
    expect(controller().revision(`Bearer ${secret}`, payload)).toEqual({
      success: true,
    });
    expect(publish).toHaveBeenCalledWith('world-1', 4);
    expect(schedule).toHaveBeenCalledWith(10_000);
    expect(
      controller().revision(`Bearer ${secret}`, {
        ...payload,
        nextEventAt: null,
      }),
    ).toEqual({ success: true });
  });

  it('treats duplicate/older notifications as successful without replacing the latest timer', () => {
    publish.mockReturnValue(false);
    expect(controller().revision(`Bearer ${secret}`, payload)).toEqual({
      success: true,
    });
    expect(schedule).not.toHaveBeenCalled();
  });

  it('probes the protected publication path without touching revision cache or game timers', () => {
    expect(
      controller().revision(`Bearer ${secret}`, {
        capability: 'revision-push-v1',
        probe: true,
      }),
    ).toEqual({ success: true, capability: 'revision-push-v1' });
    expect(publish).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
    expect(() =>
      controller().revision(undefined, {
        capability: 'revision-push-v1',
        probe: true,
      }),
    ).toThrow(UnauthorizedException);
    expect(() =>
      controller().revision(`Bearer ${secret}`, {
        capability: 'revision-push-v1',
        probe: true,
        worldId: 'world-1',
      }),
    ).toThrow(BadRequestException);
  });
});

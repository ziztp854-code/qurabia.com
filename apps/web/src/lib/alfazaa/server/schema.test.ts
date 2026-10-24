import { describe, expect, it } from 'vitest';
import { commandRequestSchema } from './schema';

describe('Alfazaa account command boundary', () => {
  it('accepts a bounded command but never accepts supplied state, time or account identity', () => {
    const request = {
      idempotencyKey: 'request-0001',
      expectedRevision: 0,
      command: { type: 'collect' },
    };
    expect(commandRequestSchema.parse(request)).toEqual(request);
    for (const extra of [{ userId: 'other' }, { state: {} }, { now: 999999 }]) {
      expect(commandRequestSchema.safeParse({ ...request, ...extra }).success).toBe(false);
    }
  });
});

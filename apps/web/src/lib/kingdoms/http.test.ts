import { describe, expect, it, vi } from 'vitest';
import {
  assertSameOrigin,
  readCommandBody,
  KingdomsHttpError,
  stableFingerprint,
  jsonFailure,
} from './http';

describe('kingdoms HTTP trust boundary', () => {
  it.each(['P2022', 'P2028'])(
    'logs only the safe Prisma %s code and keeps the response generic',
    async (code) => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        const error = Object.assign(new Error('private connection details and SQL'), {
          name: 'PrismaClientKnownRequestError',
          code,
          meta: { query: 'private SQL' },
        });
        const response = jsonFailure(error);
        expect(response.status).toBe(503);
        expect(log).toHaveBeenCalledWith('[kingdoms] request failed', error.name, code);
        expect(JSON.stringify(await response.json())).not.toMatch(/P2022|P2028|private|SQL/);
      } finally {
        log.mockRestore();
      }
    },
  );
  it('does not log arbitrary error code contents', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      jsonFailure(Object.assign(new Error('private'), { code: 'postgresql://private' }));
      expect(log).toHaveBeenCalledWith('[kingdoms] request failed', 'Error');
    } finally {
      log.mockRestore();
    }
  });
  it('accepts the configured public origin behind a proxy without trusting forwarded hosts', () => {
    const internal = 'http://localhost:3100/api/kingdoms';
    expect(() =>
      assertSameOrigin(
        new Request(internal, { headers: { origin: 'https://qurabia.com' } }),
        'https://qurabia.com',
      ),
    ).not.toThrow();
    expect(() =>
      assertSameOrigin(
        new Request(internal, {
          headers: { origin: 'https://evil.test', 'x-forwarded-host': 'evil.test' },
        }),
        'https://qurabia.com',
      ),
    ).toThrow(KingdomsHttpError);
  });
  it('rejects foreign and missing origins on commands', () => {
    expect(() =>
      assertSameOrigin(
        new Request('https://qurabia.com/api/kingdoms', {
          headers: { origin: 'https://evil.test' },
        }),
      ),
    ).toThrow(KingdomsHttpError);
    expect(() => assertSameOrigin(new Request('https://qurabia.com/api/kingdoms'))).toThrow(
      KingdomsHttpError,
    );
    expect(() =>
      assertSameOrigin(
        new Request('https://qurabia.com/api/kingdoms', {
          headers: { origin: 'https://qurabia.com' },
        }),
      ),
    ).not.toThrow();
  });
  it('limits actual body bytes even without a content-length header', async () => {
    await expect(
      readCommandBody(
        new Request('https://qurabia.com', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ data: 'x'.repeat(33_000) }),
        }),
      ),
    ).rejects.toMatchObject({ status: 413 });
  });
  it('accepts only JSON and rejects malformed bodies', async () => {
    await expect(
      readCommandBody(new Request('https://qurabia.com', { method: 'POST', body: '{}' })),
    ).rejects.toMatchObject({ status: 415 });
    await expect(
      readCommandBody(
        new Request('https://qurabia.com', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{',
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('fingerprints semantic JSON independent of object order', () => {
    expect(stableFingerprint({ b: 2, a: { y: 2, x: 1 } })).toBe(
      stableFingerprint({ a: { x: 1, y: 2 }, b: 2 }),
    );
    expect(stableFingerprint({ count: 1 })).not.toBe(stableFingerprint({ count: 2 }));
  });
});

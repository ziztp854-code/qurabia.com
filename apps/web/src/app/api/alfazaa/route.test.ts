import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { database } from '@/lib/alfazaa/server/test-database';
import { GET, POST } from './route';

const boundary = vi.hoisted(() => ({ session: vi.fn(), rate: vi.fn(), db: undefined as unknown }));
vi.mock('@/lib/auth/prisma', () => ({ getPrismaClient: () => boundary.db }));
vi.mock('@/lib/auth/session', async () => ({
  ...(await vi.importActual('@/lib/auth/session-user')),
  getCurrentSession: boundary.session,
}));
vi.mock('@/lib/auth/rate-limit', () => ({ checkRateLimit: boundary.rate }));

const body = {
  idempotencyKey: 'request-0001',
  expectedRevision: 0,
  command: { type: 'merge', from: 0, to: 1 },
};
const request = (payload: unknown = body, origin = 'http://localhost:3000') =>
  new Request('http://localhost:3000/api/alfazaa', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

beforeEach(() => {
  boundary.db = database().db;
  boundary.session.mockResolvedValue(null);
  boundary.rate.mockResolvedValue(true);
  vi.stubEnv('NEXTAUTH_URL', 'http://localhost:3000');
});
afterEach(() => vi.unstubAllEnvs());

describe('Alfazaa HTTP API', () => {
  it('rejects unauthenticated reads and writes', async () => {
    expect((await GET()).status).toBe(401);
    expect((await POST(request())).status).toBe(401);
  });
  it('keeps account commands behind the session and rejects a suspended or revoked session', async () => {
    const fixture = database();
    boundary.db = fixture.db;
    boundary.session.mockResolvedValue({ user: { id: 'alice', tokenVersion: 0 } });
    expect((await GET()).status).toBe(200);
    fixture.users.get('alice')!.status = 'SUSPENDED';
    expect((await GET()).status).toBe(401);
    fixture.users.get('alice')!.status = 'ACTIVE';
    fixture.users.get('alice')!.tokenVersion = 1;
    expect((await POST(request())).status).toBe(401);
  });
  it('round-trips real domain commands, receipt retries and revision conflicts through HTTP', async () => {
    boundary.session.mockResolvedValue({ user: { id: 'alice', tokenVersion: 0 } });
    const initial = await GET();
    expect(initial.headers.get('cache-control')).toBe('no-store');
    expect((await initial.json()).data.revision).toBe(0);
    const first = await POST(request());
    expect(first.status).toBe(200);
    const result = await first.json();
    expect(result.data.state.cells[0]).toBeNull();
    expect(result.data.revision).toBe(1);
    expect(await (await POST(request())).json()).toEqual(result);
    expect((await POST(request({ ...body, idempotencyKey: 'request-0002' }))).status).toBe(409);
  });
  it('rejects cross-origin requests, forged outcomes and unknown fields', async () => {
    boundary.session.mockResolvedValue({ user: { id: 'alice', tokenVersion: 0 } });
    expect((await POST(request(body, 'https://evil.example'))).status).toBe(403);
    for (const invalid of [
      { ...body, userId: 'bob' },
      { ...body, command: { type: 'tower-win', levelId: 65 } },
      { ...body, command: { type: 'merge', from: -1, to: 1 } },
      { ...body, command: { type: 'tower-tick', now: 9999999999999 } },
    ])
      expect((await POST(request(invalid))).status).toBe(400);
    expect((await (await GET()).json()).data.revision).toBe(0);
  });
  it('bounds request bodies and rate limits each account', async () => {
    boundary.session.mockResolvedValue({ user: { id: 'alice', tokenVersion: 0 } });
    expect((await POST(request({ padding: 'x'.repeat(33_000) }))).status).toBe(413);
    expect(
      (
        await POST(
          new Request('http://localhost:3000/api/alfazaa', {
            method: 'POST',
            headers: { origin: 'http://localhost:3000', 'content-type': 'text/plain' },
            body: '{}',
          }),
        )
      ).status,
    ).toBe(415);
    expect(
      (
        await POST(
          new Request('http://localhost:3000/api/alfazaa', {
            method: 'POST',
            headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
            body: '{',
          }),
        )
      ).status,
    ).toBe(400);
    boundary.rate.mockResolvedValue(false);
    expect((await GET()).status).toBe(429);
    expect((await POST(request())).status).toBe(429);
  });
  it('claims daily rewards once and refuses client amounts or forged quest achievement', async () => {
    boundary.session.mockResolvedValue({ user: { id: 'alice', tokenVersion: 0 } });
    const first = await POST(
      request({ ...body, command: { type: 'claim-quest', questId: 'daily-attendance' } }),
    );
    expect(first.status).toBe(200);
    const earned = await first.json();
    expect(earned.data.state.balances['110001']).toBe(220);
    expect(
      (
        await POST(
          request({
            ...body,
            idempotencyKey: 'quest-repeat',
            expectedRevision: 1,
            command: { type: 'claim-quest', questId: 'daily-attendance' },
          }),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await POST(
          request({
            ...body,
            idempotencyKey: 'quest-forged',
            expectedRevision: 1,
            command: { type: 'claim-quest', questId: 'road-104' },
          }),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await POST(
          request({
            ...body,
            idempotencyKey: 'quest-amount',
            expectedRevision: 1,
            command: {
              type: 'claim-quest',
              questId: 'daily-attendance',
              rewards: [[110001, 99999]],
            },
          }),
        )
      ).status,
    ).toBe(400);
    expect((await (await GET()).json()).data.state.balances['110001']).toBe(220);
  });
  it('does not expose connection details when storage is unavailable', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      boundary.session.mockResolvedValue({ user: { id: 'alice', tokenVersion: 0 } });
      boundary.db = {
        user: {
          findUnique: async () => {
            throw new Error('private connection URL');
          },
        },
      };
      const response = await GET();
      expect(response.status).toBe(503);
      expect(JSON.stringify(await response.json())).not.toMatch(/private|connection|URL/);
    } finally {
      log.mockRestore();
    }
  });
});

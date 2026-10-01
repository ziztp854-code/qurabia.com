import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const boundary = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  limit: vi.fn(),
  query: vi.fn(),
  findReceipt: vi.fn(),
  createReceipt: vi.fn(),
}));
vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: boundary.session,
  isSessionUserCurrent: (
    session: { id: string; tokenVersion: number },
    user: { id: string; tokenVersion: number; status: string } | null,
  ) =>
    user?.id === session.id &&
    user.tokenVersion === session.tokenVersion &&
    user.status === 'ACTIVE',
}));
vi.mock('@/lib/auth/prisma', () => {
  const tx = {
    $queryRaw: boundary.query,
    user: { findUnique: boundary.user },
    kingdomCommand: { findUnique: boundary.findReceipt, create: boundary.createReceipt },
  };
  return {
    getPrismaClient: () => ({
      ...tx,
      $transaction: (work: (transaction: typeof tx) => Promise<unknown>) => work(tx),
    }),
  };
});
vi.mock('@/lib/auth/rate-limit', () => ({ checkRateLimit: boundary.limit }));
import { GET, POST } from './route';
import { createWorld, executeCommand } from '@/lib/kingdoms/engine';
import { provisionVillageGeography } from '@/lib/mamluk-map/village-geography';

const valid = {
  worldId: 'world',
  villageId: 'v1',
  idempotencyKey: 'relocation-key-00001',
  longitude: 35,
  latitude: 32,
};
const request = (body: unknown = valid, origin = 'https://qurabia.com') =>
  new Request('https://qurabia.com/api/kingdoms/world-map/relocate', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('authenticated one-time village relocation HTTP boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXTAUTH_URL', 'https://qurabia.com');
    boundary.session.mockResolvedValue({ user: { id: 'owner', tokenVersion: 0 } });
    boundary.user.mockResolvedValue({
      id: 'owner',
      tokenVersion: 0,
      status: 'ACTIVE',
      role: 'USER',
    });
    boundary.limit.mockResolvedValue(true);
    boundary.findReceipt.mockResolvedValue(null);
    boundary.createReceipt.mockResolvedValue({});
    const state = provisionVillageGeography(
      'world',
      executeCommand(createWorld(1000), 'owner', { type: 'found', name: 'مملكة اختبار' }, 1000),
    );
    boundary.query.mockImplementation(async (sql: { sql: string }) =>
      /^\s*UPDATE/.test(sql.sql)
        ? [{ revision: 2 }]
        : [{ id: 'world', revision: 1, paused: false, state, serverTime: new Date(2000) }],
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  it('returns definitive own eligibility and authoritative relocation coordinates without private game data', async () => {
    const eligibility = await GET(
      new Request('https://qurabia.com/api/kingdoms/world-map/relocate?worldId=world&villageId=v1'),
    );
    expect(eligibility.status).toBe(200);
    expect(await eligibility.json()).toMatchObject({
      success: true,
      data: { canRelocate: true, relocationUsed: false, longitude: 31.24967, latitude: 30.06263 },
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const json = await response.json();
    expect(json).toMatchObject({
      success: true,
      data: {
        worldId: 'world',
        villageId: 'v1',
        longitude: 35,
        latitude: 32,
        relocationUsed: true,
        canRelocate: false,
        revision: 2,
      },
    });
    expect(JSON.stringify(json)).not.toMatch(
      /resources|troops|movements|armies|villageRelocations|ownerId/,
    );
  });
  it('rejects cross-origin mutation before database access', async () => {
    expect((await POST(request(valid, 'https://foreign.example'))).status).toBe(403);
    expect(boundary.query).not.toHaveBeenCalled();
  });
  it('rejects anonymous and revoked callers', async () => {
    boundary.session.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    boundary.session.mockResolvedValue({ user: { id: 'owner', tokenVersion: 1 } });
    expect(
      (
        await GET(
          new Request(
            'https://qurabia.com/api/kingdoms/world-map/relocate?worldId=world&villageId=v1',
          ),
        )
      ).status,
    ).toBe(401);
    expect(boundary.query).not.toHaveBeenCalled();
  });
  it('rejects forged actor, metadata, invalid coordinates and oversized bodies before mutation', async () => {
    for (const body of [
      { ...valid, actorId: 'enemy' },
      { ...valid, relocationUsed: false },
      { ...valid, longitude: 180 },
      { ...valid, latitude: '32' },
    ])
      expect((await POST(request(body))).status).toBe(400);
    expect((await POST(request({ padding: 'x'.repeat(33_000) }))).status).toBe(413);
    expect(boundary.query).not.toHaveBeenCalled();
  });
  it('enforces rate limits and fails closed for another owner', async () => {
    boundary.limit.mockResolvedValue(false);
    expect((await POST(request())).status).toBe(429);
    boundary.limit.mockResolvedValue(true);
    boundary.query.mockResolvedValue([]);
    expect((await POST(request())).status).toBe(404);
  });
});

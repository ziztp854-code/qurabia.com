import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorld, executeCommand } from '@/lib/kingdoms/engine';
import type { KingdomsWorld } from '@/lib/kingdoms/types';

const boundary = vi.hoisted(() => {
  const session = vi.fn(),
    user = vi.fn(),
    limit = vi.fn();
  let state: KingdomsWorld;
  let revision = 0;
  const receipts = new Map<string, { fingerprint: string }>();
  const tx = {
    user: { findUnique: user },
    $queryRaw: async (query: TemplateStringsArray, worldId?: string) =>
      query.join('').includes('clock_timestamp')
        ? [{ now: new Date(1800000000000) }]
        : worldId === 'world'
          ? [{ id: 'world', state, revision, paused: false }]
          : [],
    kingdomWorld: {
      update: async ({ data }: { data: { state: KingdomsWorld } }) => {
        state = data.state;
        revision += 1;
        return { revision };
      },
    },
    kingdomCommand: {
      findUnique: async ({ where }: { where: { worldId_actorId_key: { key: string } } }) =>
        receipts.get(where.worldId_actorId_key.key),
      count: async () => 0,
      create: async ({ data }: { data: { key: string; fingerprint: string } }) => {
        receipts.set(data.key, data);
        return data;
      },
    },
  };
  return {
    session,
    user,
    limit,
    db: { ...tx, $transaction: async (work: (value: typeof tx) => unknown) => work(tx) },
    reset: (world: KingdomsWorld) => {
      state = world;
      revision = 0;
      receipts.clear();
    },
  };
});
vi.mock('@/lib/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/session')>()),
  getCurrentSession: boundary.session,
}));
vi.mock('@/lib/auth/prisma', () => ({
  getPrismaClient: () => boundary.db,
  hasDatabaseUrl: () => false,
}));
vi.mock('@/lib/auth/rate-limit', () => ({ checkRateLimit: boundary.limit }));
import { GET, POST } from './route';
const url = 'https://qurabia.com/api/kingdoms/siege-workshop';
const read = (villageId: string) => new Request(`${url}?worldId=world&villageId=${villageId}`);
const write = (body: unknown, origin = 'https://qurabia.com') =>
  new Request(url, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
function account(id: string) {
  boundary.session.mockResolvedValue({ user: { id, tokenVersion: 2 } });
  boundary.user.mockResolvedValue({ id, status: 'ACTIVE', role: 'USER', tokenVersion: 2 });
}
let villageId = '';

describe('Workshop authenticated HTTP boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const world = executeCommand(
      createWorld(1800000000000),
      'alice',
      { type: 'found', name: 'ألف' },
      1800000000000,
    );
    const village = Object.values(world.villages)[0];
    villageId = village.id;
    boundary.reset({
      ...world,
      villages: {
        ...world.villages,
        [villageId]: { ...village, buildings: { ...village.buildings, hall: 2 } },
      },
    });
    account('alice');
    boundary.limit.mockResolvedValue(true);
  });
  it('persists a real owned workshop and denies reading or purchasing another kingdom workshop', async () => {
    expect(
      (
        await POST(
          write({ worldId: 'world', villageId, action: { type: 'upgrade', key: 'build' } }),
        )
      ).status,
    ).toBe(200);
    const loaded = await GET(read(villageId));
    expect(loaded.headers.get('cache-control')).toBe('no-store');
    expect(await loaded.json()).toMatchObject({
      success: true,
      data: { playerId: 'alice', level: 1 },
    });
    account('bob');
    expect((await GET(read(villageId))).status).toBe(403);
    expect(
      (
        await POST(
          write({ worldId: 'world', villageId, action: { type: 'upgrade', key: 'stolen' } }),
        )
      ).status,
    ).toBe(403);
  });
  it('denies missing sessions, revoked tokens, cross origin requests and rate-limited requests', async () => {
    boundary.session.mockResolvedValue(null);
    expect((await GET(read(villageId))).status).toBe(401);
    account('alice');
    boundary.user.mockResolvedValue({
      id: 'alice',
      status: 'ACTIVE',
      role: 'USER',
      tokenVersion: 3,
    });
    expect((await GET(read(villageId))).status).toBe(401);
    account('alice');
    const body = { worldId: 'world', villageId, action: { type: 'upgrade', key: 'build' } };
    expect((await POST(write(body, 'https://evil.test'))).status).toBe(403);
    boundary.limit.mockResolvedValue(false);
    expect((await GET(read(villageId))).status).toBe(429);
    expect((await POST(write(body))).status).toBe(429);
  });
  it('enforces strict command schema, JSON type, body size and server resource limits', async () => {
    const body = { worldId: 'world', villageId, action: { type: 'upgrade', key: 'build' } };
    expect((await POST(write({ ...body, playerId: 'bob' }))).status).toBe(400);
    expect(
      (await POST(write({ ...body, action: { type: 'upgrade', key: 'a'.repeat(75) } }))).status,
    ).toBe(400);
    expect(
      (
        await POST(
          write({
            ...body,
            action: { type: 'craft', key: 'craft', equipment: 'catapult', count: 1.5 },
          }),
        )
      ).status,
    ).toBe(400);
    expect((await POST(write({ ...body, padding: 'x'.repeat(33000) }))).status).toBe(413);
    expect(
      (
        await POST(
          new Request(url, {
            method: 'POST',
            headers: { origin: 'https://qurabia.com', 'content-type': 'text/plain' },
            body: JSON.stringify(body),
          }),
        )
      ).status,
    ).toBe(415);
    expect((await POST(write(body))).status).toBe(200);
    expect(
      (
        await POST(
          write({
            ...body,
            action: { type: 'craft', key: 'poor', equipment: 'catapult', count: 10 },
          }),
        )
      ).status,
    ).toBe(409);
  });
});

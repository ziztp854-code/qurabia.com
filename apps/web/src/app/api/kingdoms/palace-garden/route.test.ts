import { beforeEach, describe, expect, it, vi } from 'vitest';

const boundary = vi.hoisted(() => {
  const session = vi.fn(), user = vi.fn(), limit = vi.fn();
  let row = { id: 'world', revision: 8, paused: false, state: { villages: {
    a: { id: 'a', ownerId: 'alice' }, b: { id: 'b', ownerId: 'bob' },
  } } };
  const tx = { user: { findUnique: user },
    $queryRaw: async () => [row],
    kingdomWorld: {
      findUnique: async () => row,
      update: async ({ data }: { data: { state: typeof row.state } }) => {
        row = { ...row, state: data.state, revision: row.revision + 1 };
        return row;
      },
    },
  };
  return { session, user, limit, db: { ...tx, $transaction: async (work: (value: typeof tx) => unknown) => work(tx) },
    reset: () => { row = { id: 'world', revision: 8, paused: false, state: { villages: {
      a: { id: 'a', ownerId: 'alice' }, b: { id: 'b', ownerId: 'bob' },
    } } }; },
  };
});
vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: boundary.session,
  isSessionUserCurrent: (session: { id: string; tokenVersion: number }, user: { id: string; tokenVersion: number; status: string } | null) =>
    user?.status === 'ACTIVE' && user.id === session.id && user.tokenVersion === session.tokenVersion,
}));
vi.mock('@/lib/auth/prisma', () => ({ getPrismaClient: () => boundary.db }));
vi.mock('@/lib/auth/rate-limit', () => ({ checkRateLimit: boundary.limit }));
import { GET, PUT } from './route';
const url = 'https://qurabia.com/api/kingdoms/palace-garden';
const read = (villageId = 'a') => new Request(`${url}?worldId=world&villageId=${villageId}`);
const write = (body: unknown, origin = 'https://qurabia.com') => new Request(url, {
  method: 'PUT', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body),
});
function account(id: 'alice' | 'bob') {
  boundary.session.mockResolvedValue({ user: { id, tokenVersion: 2 } });
  boundary.user.mockResolvedValue({ id, status: 'ACTIVE', role: 'USER', tokenVersion: 2 });
}

describe('Palace garden authenticated API', () => {
  beforeEach(() => { vi.clearAllMocks(); boundary.reset(); account('alice'); boundary.limit.mockResolvedValue(true); });
  it('saves and reloads Alice garden while Bob receives only his own garden', async () => {
    const saved = await PUT(write({ worldId: 'world', villageId: 'a', slots: [{ slotId: 0, itemId: 'red-roses' }] }));
    expect(saved.status).toBe(200);
    const loaded = await GET(read());
    expect(loaded.headers.get('cache-control')).toBe('no-store');
    expect(await loaded.json()).toMatchObject({ success: true, data: { playerId: 'alice', slots: [{ slotId: 0, itemId: 'red-roses' }] } });
    account('bob');
    expect((await GET(read())).status).toBe(403);
    expect((await PUT(write({ worldId: 'world', villageId: 'a', slots: [] }))).status).toBe(403);
    expect(await (await GET(read('b'))).json()).toMatchObject({ data: { playerId: 'bob', slots: [] } });
  });

  it('rejects unauthenticated, revoked and suspended identities', async () => {
    boundary.session.mockResolvedValue(null);
    expect((await GET(read())).status).toBe(401);
    account('alice');
    boundary.user.mockResolvedValue({ id: 'alice', status: 'ACTIVE', tokenVersion: 3 });
    expect((await GET(read())).status).toBe(401);
    boundary.user.mockResolvedValue({ id: 'alice', status: 'SUSPENDED', tokenVersion: 2 });
    expect((await PUT(write({ worldId: 'world', villageId: 'a', slots: [] }))).status).toBe(401);
  });
  it('rejects cross-origin writes and rate-limited reads and writes', async () => {
    expect((await PUT(write({ worldId: 'world', villageId: 'a', slots: [] }, 'https://evil.test'))).status).toBe(403);
    boundary.limit.mockResolvedValue(false);
    expect((await GET(read())).status).toBe(429);
    expect((await PUT(write({ worldId: 'world', villageId: 'a', slots: [] }))).status).toBe(429);
  });
  it.each([
    { worldId: 'world', villageId: 'a', slots: [], playerId: 'bob' },
    { worldId: 'world', villageId: 'a', slots: [{ slotId: 12, itemId: 'red-roses' }] },
    { worldId: 'world', villageId: 'a', slots: [{ slotId: 0, itemId: 'missing' }] },
    { worldId: 'world', villageId: 'a', slots: [{ slotId: 1, itemId: 'red-roses' }, { slotId: 1, itemId: 'bench' }] },
  ])('rejects unsafe or forged catalog requests %j', async (body) => {
    expect((await PUT(write(body))).status).toBe(400);
  });
  it('enforces JSON body and body size limits', async () => {
    const body = { worldId: 'world', villageId: 'a', slots: [] };
    expect((await PUT(new Request(url, { method: 'PUT', headers: { origin: 'https://qurabia.com', 'content-type': 'text/plain' }, body: JSON.stringify(body) }))).status).toBe(415);
    expect((await PUT(write({ ...body, padding: 'x'.repeat(33000) }))).status).toBe(413);
  });
});

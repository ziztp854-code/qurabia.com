import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DatabaseClient } from '@tahaddi/database';

// Never fall back to the application's database: integration tests require an isolated local database.
const databaseUrl = process.env.GAME_FAVORITES_TEST_DATABASE_URL;
function assertIsolatedDatabase(value: string) {
  const url = new URL(value);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    !/^\/favorites_test(?:_[a-zA-Z0-9_-]+)?$/.test(url.pathname) ||
    url.search || url.hash
  ) throw new Error('GAME_FAVORITES_TEST_DATABASE_URL must target an isolated local favorites_test database.');
}

let db: DatabaseClient;
let currentUser = '';
vi.mock('@/lib/auth/prisma', () => ({ getPrismaClient: () => db }));
vi.mock('@/lib/voice/identity', () => ({
  voiceActor: async () => ({ id: currentUser }),
  voiceRateLimit: async () => {},
}));

import { GET, PUT } from './route';

function request(gameId: string, favorite: boolean) {
  return new Request('http://localhost:3000/api/game-favorites', {
    method: 'PUT', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
    body: JSON.stringify({ gameId, favorite }),
  });
}

describe.skipIf(!databaseUrl)('game favorites PostgreSQL integration', () => {
  const users = [`favorite_test_${randomUUID()}`, `favorite_test_${randomUUID()}`];
  beforeAll(async () => {
    assertIsolatedDatabase(databaseUrl!);
    const { createPrismaClient } = await import('@tahaddi/database');
    db = createPrismaClient(databaseUrl!);
    await db.user.createMany({ data: users.map((id) => ({ id, status: 'ACTIVE' as const })) });
  });
  afterAll(async () => {
    if (!db) return;
    try { await db.user.deleteMany({ where: { id: { in: users } } }); }
    finally { await db.$disconnect(); }
  });
  it('persists idempotently and isolates reads and deletes between accounts', async () => {
    currentUser = users[0]!;
    expect((await PUT(request('chess', true))).status).toBe(200);
    expect((await PUT(request('chess', true))).status).toBe(200);
    expect(await (await GET()).json()).toEqual({ gameIds: ['chess'] });
    currentUser = users[1]!;
    expect(await (await GET()).json()).toEqual({ gameIds: [] });
    expect((await PUT(request('chess', false))).status).toBe(200);
    currentUser = users[0]!;
    expect(await (await GET()).json()).toEqual({ gameIds: ['chess'] });
    expect((await PUT(request('chess', false))).status).toBe(200);
    expect(await (await GET()).json()).toEqual({ gameIds: [] });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
const d = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  create: vi.fn(),
  edit: vi.fn(),
  read: vi.fn(),
}));
vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: d.session,
  isSessionUserCurrent: () => true,
}));
vi.mock('@/lib/auth/prisma', () => ({ getPrismaClient: () => ({ user: { findUnique: d.user } }) }));
vi.mock('@/lib/auth/rate-limit', () => ({ checkRateLimit: async () => true }));
vi.mock('@/lib/kingdoms/repository', () => ({
  createKingdomWorld: d.create,
  editKingdomWorld: d.edit,
  readKingdomWorld: d.read,
}));
import { POST } from './route';
import { createWorld } from '@/lib/kingdoms/engine';
import type { KingdomsWorld } from '@/lib/kingdoms/types';
const request = () =>
  new Request('https://qurabia.com/api/admin/kingdoms', {
    method: 'POST',
    headers: { origin: 'https://qurabia.com', 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'create',
      idempotencyKey: 'admin-create-00001',
      name: 'عالم الفجر',
    }),
  });
describe('Kingdoms administrative authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    d.session.mockResolvedValue({ user: { id: 'staff' } });
    d.create.mockResolvedValue({ id: 'world1' });
  });
  it.each(['USER', 'MODERATOR', 'CONTENT_EDITOR'])(
    'denies %s even if they can enter parts of the admin console',
    async (role) => {
      d.user.mockResolvedValue({ id: 'staff', role });
      expect((await POST(request())).status).toBe(403);
      expect(d.create).not.toHaveBeenCalled();
    },
  );
  it.each(['ADMIN', 'OWNER'])('permits %s', async (role) => {
    d.user.mockResolvedValue({ id: 'staff', role });
    expect((await POST(request())).status).toBe(200);
  });
  it('settles a season explicitly and rejects arbitrary historical rewrites', async () => {
    const now = 1_800_000_000_000;
    const initial = createWorld(now);
    d.user.mockResolvedValue({ id: 'staff', role: 'ADMIN' });
    d.edit.mockImplementation(
      async (
        _worldId: string,
        _actor: unknown,
        _key: string,
        _change: unknown,
        mutate: (world: KingdomsWorld, time: number) => KingdomsWorld,
      ) => mutate(initial, now),
    );
    const seasonRequest = (endsAt: number) =>
      new Request('https://qurabia.com/api/admin/kingdoms', {
        method: 'POST',
        headers: { origin: 'https://qurabia.com', 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'season',
          worldId: 'world1',
          idempotencyKey: 'admin-season-00001',
          endsAt,
        }),
      });
    const ended = await POST(seasonRequest(now));
    expect(ended.status).toBe(200);
    expect((await ended.json()).data.season.status).toBe('ended');
    expect((await POST(seasonRequest(now - 61_000))).status).toBe(400);
    expect(initial.season.status).toBe('active');
  });
});

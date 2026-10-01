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
import { provisionVillageGeography } from '@/lib/mamluk-map/village-geography';
import type { VillageRelocationWorld } from '@/lib/mamluk-map/village-relocation';
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

describe('audited administrator village relocation', () => {
  const now = 1_800_000_000_000;
  let initial: VillageRelocationWorld;
  let villageId: string;
  let paused: boolean;
  const destination = { longitude: 51.53096, latitude: 25.28545 };
  function relocationRequest(extra: Record<string, unknown> = {}, origin = 'https://qurabia.com') {
    return new Request('https://qurabia.com/api/admin/kingdoms', {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'relocate',
        worldId: 'world1',
        villageId,
        expectedOwnerId: 'amira',
        idempotencyKey: 'admin-relocation-00001',
        confirmed: true,
        ...destination,
        ...extra,
      }),
    });
  }
  beforeEach(async () => {
    vi.clearAllMocks();
    const { executeCommand } = await import('@/lib/kingdoms/engine');
    initial = provisionVillageGeography(
      'world1',
      executeCommand(createWorld(now), 'amira', { type: 'found', name: 'Amira' }, now),
    );
    villageId = Object.keys(initial.villages)[0]!;
    paused = false;
    d.session.mockResolvedValue({ user: { id: 'staff' } });
    d.user.mockResolvedValue({ id: 'staff', role: 'ADMIN' });
    d.edit.mockImplementation(async (_worldId, _actor, _key, _change, mutate) =>
      mutate(initial, now, { revision: 7, paused }),
    );
  });
  it('moves the selected village while preserving ownership and attributing the action to the administrator', async () => {
    const response = await POST(relocationRequest());
    expect(response.status).toBe(200);
    const saved = (await response.json()).data;
    expect(
      saved.geography.cities.find((city: { value: { id: string } }) => city.value.id === villageId)
        .value,
    ).toMatchObject({ ...destination, ownerPlayerId: 'amira' });
    expect(saved.geography.villageRelocations[villageId]).toMatchObject({
      ...destination,
      actorId: 'staff',
      at: now,
    });
    expect(saved.villages).toEqual(initial.villages);
    expect(saved.movements).toEqual(initial.movements);
    expect(initial.geography?.villageRelocations?.[villageId]).toBeUndefined();
    expect(d.edit.mock.calls[0]?.[1]).toMatchObject({ id: 'staff', role: 'ADMIN' });
  });
  it.each(['USER', 'MODERATOR', 'CONTENT_EDITOR'])('denies relocation by %s', async (role) => {
    d.user.mockResolvedValue({ id: 'staff', role });
    expect((await POST(relocationRequest())).status).toBe(403);
    expect(d.edit).not.toHaveBeenCalled();
  });
  it('rejects cross-origin requests before changing a village', async () => {
    expect((await POST(relocationRequest({}, 'https://external.example'))).status).toBe(403);
    expect(d.edit).not.toHaveBeenCalled();
  });
  it.each([
    { confirmed: false },
    { confirmed: undefined },
    { longitude: 180 },
    { latitude: 86 },
    { actorId: 'amira' },
  ])('rejects an invalid or unconfirmed request %o', async (extra) => {
    expect((await POST(relocationRequest(extra))).status).toBe(400);
    expect(d.edit).not.toHaveBeenCalled();
  });
  it('checks pause state from the locked transaction', async () => {
    paused = true;
    expect((await POST(relocationRequest())).status).toBe(409);
    expect(initial.geography?.villageRelocations?.[villageId]).toBeUndefined();
  });
  it('keeps the one-use restriction for administrators', async () => {
    const first = await POST(relocationRequest());
    expect(first.status).toBe(200);
    initial = (await first.json()).data;
    expect((await POST(relocationRequest({ longitude: 52 }))).status).toBe(409);
  });
  it('rejects a nonexistent village without consuming another village relocation', async () => {
    expect((await POST(relocationRequest({ villageId: 'missing' }))).status).toBe(404);
    expect(initial.geography?.villageRelocations?.[villageId]).toBeUndefined();
  });
  it('rejects a changed owner instead of moving a different player village', async () => {
    expect((await POST(relocationRequest({ expectedOwnerId: 'other' }))).status).toBe(409);
    expect(initial.geography?.villageRelocations?.[villageId]).toBeUndefined();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  kingdomWorld: { findUnique: vi.fn() },
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
}));
vi.mock('@/lib/auth/prisma', () => ({ getPrismaClient: () => db }));
vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: async () => ({ user: { id: 'alice', tokenVersion: 2 } }),
  isSessionUserCurrent: () => true,
}));
vi.mock('@/lib/auth/rate-limit', () => ({ checkRateLimit: async () => true }));

import { createWorld, executeCommand } from '@/lib/kingdoms/engine';
import { GET } from './route';

const start = 1_800_000_000_000;
describe('loading persisted villages through the Kingdoms API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.user.findUnique.mockResolvedValue({
      id: 'alice',
      status: 'ACTIVE',
      tokenVersion: 2,
      role: 'USER',
    });
    db.$queryRaw.mockResolvedValue([{ now: new Date(start + 3600000) }]);
    db.$transaction.mockImplementation((work) => work(db));
  });

  it.each(['caravans', 'sieges', 'both'] as const)(
    'returns the village successfully when saved %s fields are absent',
    async (missing) => {
      const saved = executeCommand(
        createWorld(start),
        'alice',
        { type: 'found', name: 'مملكة النور' },
        start,
      );
      const { caravans, sieges, ...legacy } = saved;
      const state = JSON.parse(
        JSON.stringify({
          ...legacy,
          ...(missing === 'sieges' ? { caravans } : {}),
          ...(missing === 'caravans' ? { sieges } : {}),
        }),
      );
      const before = structuredClone(state);
      db.kingdomWorld.findUnique.mockResolvedValue({
        id: 'world1',
        name: 'العالم',
        state,
        revision: 7,
        paused: false,
      });
      const response = await GET(new Request('https://qurabia.com/api/kingdoms?worldId=world1'));
      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload.success).toBe(true);
      expect(payload.data.villages).toHaveLength(1);
      expect(payload.data.villages[0].resources.wood).toBe(980);
      expect(payload.data.caravans).toEqual([]);
      expect(payload.data.sieges).toEqual([]);
      expect(state).toEqual(before);
    },
  );

  it('loads a persisted four-unit village after new unit types are introduced', async () => {
    const saved = executeCommand(
      createWorld(start),
      'alice',
      { type: 'found', name: 'قرية قديمة' },
      start,
    );
    const village = Object.values(saved.villages)[0];
    const originalUnits = new Set(['guard', 'rider', 'scout', 'settler']);
    const legacy = Object.fromEntries(
      Object.entries(saved).filter(([field]) => !['caravans', 'sieges'].includes(field)),
    );
    const state = JSON.parse(
      JSON.stringify({
        ...legacy,
        config: {
          ...saved.config,
          units: Object.fromEntries(
            Object.entries(saved.config.units).filter(([unit]) => originalUnits.has(unit)),
          ),
        },
        villages: {
          [village.id]: { ...village, troops: { guard: 7, rider: 2, scout: 1, settler: 0 } },
        },
      }),
    );
    const before = structuredClone(state);
    db.kingdomWorld.findUnique.mockResolvedValue({
      id: 'world1',
      name: 'العالم',
      state,
      revision: 7,
      paused: false,
    });
    const response = await GET(new Request('https://qurabia.com/api/kingdoms?worldId=world1'));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.data.villages[0].troops).toMatchObject({
      guard: 7,
      rider: 2,
      archer: 0,
      siege_tower: 0,
    });
    expect(Number.isFinite(payload.data.villages[0].resources.food)).toBe(true);
    expect(Number.isFinite(payload.data.villages[0].progression.power.total)).toBe(true);
    expect(state).toEqual(before);
  });
});

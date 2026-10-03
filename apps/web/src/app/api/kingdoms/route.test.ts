import { beforeEach, describe, expect, it, vi } from 'vitest';
const dependencies = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  limit: vi.fn(),
  command: vi.fn(),
  read: vi.fn(),
}));
vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: dependencies.session,
  isSessionUserCurrent: (
    session: { id: string; tokenVersion: number },
    stored: { id: string; tokenVersion: number; status: string } | null,
  ) =>
    stored?.status === 'ACTIVE' &&
    stored.id === session.id &&
    stored.tokenVersion === session.tokenVersion,
}));
vi.mock('@/lib/auth/prisma', () => ({
  getPrismaClient: () => ({ user: { findUnique: dependencies.user } }),
}));
vi.mock('@/lib/auth/rate-limit', () => ({ checkRateLimit: dependencies.limit }));
vi.mock('@/lib/kingdoms/repository', () => ({
  commandKingdomWorld: dependencies.command,
  readKingdomWorld: dependencies.read,
}));
import { GET, POST } from './route';
import { kingdomsCommandSchema } from '@/lib/kingdoms/commands';

const request = (body: unknown) =>
  new Request('https://qurabia.com/api/kingdoms', {
    method: 'POST',
    headers: { origin: 'https://qurabia.com', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const valid = {
  worldId: 'world1',
  idempotencyKey: 'a-request-key-00001',
  command: { type: 'found', name: 'مملكة النور' },
};
describe('Kingdoms authenticated commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dependencies.session.mockResolvedValue({ user: { id: 'alice', tokenVersion: 2 } });
    dependencies.user.mockResolvedValue({
      id: 'alice',
      tokenVersion: 2,
      role: 'USER',
      status: 'ACTIVE',
    });
    dependencies.limit.mockResolvedValue(true);
    dependencies.command.mockResolvedValue({ player: { name: 'مملكة النور' } });
  });
  it('binds the command actor to the revalidated session', async () => {
    const response = await POST(request(valid));
    expect(response.status).toBe(200);
    expect(dependencies.command).toHaveBeenCalledWith(
      'world1',
      expect.objectContaining({ id: 'alice', tokenVersion: 2 }),
      valid.idempotencyKey,
      valid.command,
    );
  });
  it('rejects client-supplied actor identity and extra envelope fields', async () => {
    expect((await POST(request({ ...valid, actorId: 'victim' }))).status).toBe(400);
    expect(dependencies.command).not.toHaveBeenCalled();
  });
  it('accepts a gathering order bound to the authenticated player', async () => {
    dependencies.command.mockImplementation(async (_world, _identity, _key, input) => {
      kingdomsCommandSchema.parse(input);
      return { movements: [] };
    });
    const command = {
      type: 'march',
      villageId: 'v1',
      targetX: 2,
      targetY: 2,
      mission: 'gather',
      troops: { guard: 2, rider: 0, scout: 0, settler: 0 },
    };
    const response = await POST(request({ ...valid, command }));
    expect(response.status).toBe(200);
    expect(dependencies.command).toHaveBeenCalledWith(
      'world1',
      expect.objectContaining({ id: 'alice', tokenVersion: 2 }),
      valid.idempotencyKey,
      command,
    );
  });
  it('rejects client-supplied gathering supply, capacity and loot', async () => {
    dependencies.command.mockImplementation(async (_world, _identity, _key, input) => {
      kingdomsCommandSchema.parse(input);
      return {};
    });
    for (const extra of [{ available: 9999 }, { carry: 9999 }, { loot: { wood: 9999 } }]) {
      const response = await POST(
        request({
          ...valid,
          command: {
            type: 'march',
            villageId: 'v1',
            targetX: 2,
            targetY: 2,
            mission: 'gather',
            troops: { guard: 2, rider: 0, scout: 0, settler: 0 },
            ...extra,
          },
        }),
      );
      expect(response.status).toBe(400);
    }
    expect(dependencies.command).toHaveBeenCalledTimes(3);
  });
  it('binds an alliance event reward claim to the authenticated player', async () => {
    dependencies.command.mockImplementation(async (_world, _identity, _key, input) => {
      kingdomsCommandSchema.parse(input);
      return { player: { name: 'مملكة النور' } };
    });
    const command = { type: 'allianceEventClaim', villageId: 'v1', eventKey: 's1-w0' };
    const response = await POST(request({ ...valid, command }));
    expect(response.status).toBe(200);
    expect(dependencies.command).toHaveBeenCalledWith(
      'world1',
      expect.objectContaining({ id: 'alice', tokenVersion: 2 }),
      valid.idempotencyKey,
      command,
    );
  });
  it('returns validation errors for forged event fields rejected by the command boundary', async () => {
    dependencies.command.mockImplementation(async (_world, _identity, _key, input) => {
      kingdomsCommandSchema.parse(input);
      return {};
    });
    for (const extra of [{ points: 30 }, { reward: 1000 }, { allianceId: 'other' }]) {
      const response = await POST(
        request({
          ...valid,
          command: { type: 'allianceEventClaim', villageId: 'v1', eventKey: 's1-w0', ...extra },
        }),
      );
      expect(response.status).toBe(400);
    }
    expect(dependencies.command).toHaveBeenCalledTimes(3);
  });
  it('rejects suspended users and revoked tokens before any game mutation', async () => {
    dependencies.user.mockResolvedValue({ id: 'alice', status: 'SUSPENDED', tokenVersion: 2 });
    expect((await POST(request(valid))).status).toBe(401);
    dependencies.user.mockResolvedValue({ id: 'alice', status: 'ACTIVE', tokenVersion: 3 });
    expect((await POST(request(valid))).status).toBe(401);
    expect(dependencies.command).not.toHaveBeenCalled();
  });
  it('recruits a commander using the session actor and rejects client-generated experience or combat stats', async () => {
    dependencies.command.mockImplementation(async (_world, _identity, _key, input) => {
      kingdomsCommandSchema.parse(input);
      return { commanders: [] };
    });
    const command = {
      type: 'commanderRecruit',
      villageId: 'v1',
      name: 'بيبرس',
      specialization: 'cavalry',
    };
    expect((await POST(request({ ...valid, command }))).status).toBe(200);
    expect(dependencies.command).toHaveBeenCalledWith(
      'world1',
      expect.objectContaining({ id: 'alice', tokenVersion: 2 }),
      valid.idempotencyKey,
      command,
    );
    for (const extra of [
      { playerId: 'victim' },
      { experience: 10000 },
      { attack: 999 },
      { level: 50 },
    ]) {
      expect((await POST(request({ ...valid, command: { ...command, ...extra } }))).status).toBe(
        400,
      );
    }
  });
  it('rate limits before processing commands', async () => {
    dependencies.limit.mockResolvedValue(false);
    expect((await POST(request(valid))).status).toBe(429);
    expect(dependencies.command).not.toHaveBeenCalled();
  });
  it('returns a redacted incoming projection without attacker military secrets', async () => {
    const { createWorld, executeCommand, projectWorld } = await import('@/lib/kingdoms/engine');
    const { emptyTroops } = await import('@/lib/kingdoms/simulation');
    const now = 1_800_000_000_000;
    let world = executeCommand(createWorld(now), 'alice', { type: 'found', name: 'مملكة النور' }, now);
    world = executeCommand(world, 'bob', { type: 'found', name: 'مملكة الظل' }, now);
    const alice = Object.values(world.villages).find((village) => village.ownerId === 'alice')!;
    const bob = Object.values(world.villages).find((village) => village.ownerId === 'bob')!;
    world.players.alice.protectionUntil = now;
    world.players.bob.protectionUntil = now;
    alice.troops.guard = 12;
    const marched = executeCommand(
      world,
      'alice',
      {
        type: 'march',
        villageId: alice.id,
        targetX: bob.x,
        targetY: bob.y,
        mission: 'attack',
        troops: { ...emptyTroops(), guard: 6 },
      },
      now,
    );
    dependencies.read.mockResolvedValue(projectWorld(marched, 'bob', now));
    const response = await GET(new Request('https://qurabia.com/api/kingdoms?worldId=world1'));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { incoming: unknown[]; movements: unknown[] };
    };
    expect(body.data.movements).toEqual([]);
    expect(body.data.incoming).toHaveLength(1);
    const serialized = JSON.stringify(body.data.incoming);
    expect(serialized).not.toContain('"troops"');
    expect(serialized).not.toContain('"commanderId"');
    expect(serialized).not.toContain('"loot"');
    expect(serialized).toContain('"mission":"attack"');
  });
  it('requires authentication to view private state', async () => {
    dependencies.session.mockResolvedValue(null);
    expect((await GET(new Request('https://qurabia.com/api/kingdoms?worldId=world1'))).status).toBe(
      401,
    );
    expect(dependencies.read).not.toHaveBeenCalled();
  });
  it('rejects cross-site posts', async () => {
    const response = await POST(
      new Request('https://qurabia.com/api/kingdoms', {
        method: 'POST',
        headers: { origin: 'https://evil.test' },
        body: '{}',
      }),
    );
    expect(response.status).toBe(403);
    expect(dependencies.command).not.toHaveBeenCalled();
  });
});

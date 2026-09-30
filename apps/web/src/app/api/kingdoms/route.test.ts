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
      const response = await POST(request({
        ...valid,
        command: { type: 'allianceEventClaim', villageId: 'v1', eventKey: 's1-w0', ...extra },
      }));
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
  it('rate limits before processing commands', async () => {
    dependencies.limit.mockResolvedValue(false);
    expect((await POST(request(valid))).status).toBe(429);
    expect(dependencies.command).not.toHaveBeenCalled();
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

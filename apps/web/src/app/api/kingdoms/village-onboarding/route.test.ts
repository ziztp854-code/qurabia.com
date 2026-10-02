import { beforeEach, describe, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  limit: vi.fn(),
  read: vi.fn(),
  complete: vi.fn(),
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
vi.mock('@/lib/kingdoms/village-onboarding', () => ({
  readVillageOnboarding: dependencies.read,
  completeVillageOnboarding: dependencies.complete,
}));

import { GET, POST } from './route';
import { KingdomsHttpError } from '@/lib/kingdoms/http';

const url = 'https://qurabia.com/api/kingdoms/village-onboarding';
const request = (body: unknown) =>
  new Request(url, {
    method: 'POST',
    headers: { origin: 'https://qurabia.com', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('Account village onboarding', () => {
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
    dependencies.read.mockResolvedValue({ completed: false, completedAt: null });
    dependencies.complete.mockResolvedValue({
      completed: true,
      completedAt: '2026-10-02T12:00:00.000Z',
    });
  });

  it('reads completion for the revalidated account with no-store caching', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      success: true,
      data: { completed: false, completedAt: null },
    });
    expect(dependencies.read).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'alice', tokenVersion: 2 }),
    );
  });

  it('completes onboarding only for the authenticated account', async () => {
    const response = await POST(request({ completed: true }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: { completed: true, completedAt: '2026-10-02T12:00:00.000Z' },
    });
    expect(dependencies.complete).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'alice', tokenVersion: 2 }),
    );
  });

  it('rejects missing sessions before reads and writes', async () => {
    dependencies.session.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await POST(request({ completed: true }))).status).toBe(401);
    expect(dependencies.read).not.toHaveBeenCalled();
    expect(dependencies.complete).not.toHaveBeenCalled();
  });

  it('rejects suspended accounts and revoked sessions', async () => {
    dependencies.user.mockResolvedValue({ id: 'alice', status: 'SUSPENDED', tokenVersion: 2 });
    expect((await GET()).status).toBe(401);
    expect((await POST(request({ completed: true }))).status).toBe(401);
    dependencies.user.mockResolvedValue({ id: 'alice', status: 'ACTIVE', tokenVersion: 3 });
    expect((await POST(request({ completed: true }))).status).toBe(401);
    expect(dependencies.complete).not.toHaveBeenCalled();
  });

  it('rate limits before account access', async () => {
    dependencies.limit.mockResolvedValue(false);
    expect((await GET()).status).toBe(429);
    expect((await POST(request({ completed: true }))).status).toBe(429);
    expect(dependencies.read).not.toHaveBeenCalled();
    expect(dependencies.complete).not.toHaveBeenCalled();
  });

  it('rejects cross-origin completion requests', async () => {
    expect(
      (
        await POST(
          new Request(url, {
            method: 'POST',
            headers: { origin: 'https://evil.test', 'content-type': 'application/json' },
            body: '{"completed":true}',
          }),
        )
      ).status,
    ).toBe(403);
    expect(dependencies.complete).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { completed: false },
    { completed: true, actorId: 'another-account' },
    { completed: true, completedAt: '2020-01-01T00:00:00.000Z' },
    { completed: true, worldId: 'world' },
  ])('rejects invalid completion payload %j', async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(dependencies.complete).not.toHaveBeenCalled();
  });

  it('requires JSON requests and rejects oversized bodies', async () => {
    expect(
      (
        await POST(
          new Request(url, {
            method: 'POST',
            headers: { origin: 'https://qurabia.com', 'content-type': 'text/plain' },
            body: '{"completed":true}',
          }),
        )
      ).status,
    ).toBe(415);
    expect((await POST(request({ completed: true, text: 'x'.repeat(33_000) }))).status).toBe(413);
    expect(dependencies.complete).not.toHaveBeenCalled();
  });

  it('reports a session revoked during persistence without accepting completion', async () => {
    dependencies.complete.mockRejectedValue(new KingdomsHttpError(401, 'الجلسة غير صالحة.'));
    const response = await POST(request({ completed: true }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ success: false, error: 'الجلسة غير صالحة.' });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  identity: vi.fn(),
  rate: vi.fn(),
  list: vi.fn(),
  mark: vi.fn(),
  detail: vi.fn(),
}));
vi.mock('@/lib/kingdoms/identity', () => ({
  kingdomIdentity: mocks.identity,
  kingdomRateLimit: mocks.rate,
}));
vi.mock('@/lib/kingdoms/reports-repository', () => ({
  listRoyalReports: mocks.list,
  markRoyalReportRead: mocks.mark,
  readRoyalReport: mocks.detail,
}));
import { GET, PATCH } from './route';
import { GET as DETAIL } from './[reportId]/route';
import { KingdomsHttpError } from '@/lib/kingdoms/http';
import { reportsQuerySchema } from '@/lib/kingdoms/reports-schema';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.identity.mockResolvedValue({ id: 'owner', tokenVersion: 3 });
  mocks.list.mockResolvedValue({ items: [] });
  mocks.mark.mockResolvedValue({ readAt: 123 });
  mocks.detail.mockResolvedValue({ id: 'r2' });
});
describe('Royal Reports HTTP boundaries', () => {
  it('requires authenticated identity before reading reports', async () => {
    mocks.identity.mockRejectedValue(new KingdomsHttpError(401, 'expired'));
    expect(
      (await GET(new Request('http://localhost/api/kingdoms/reports?worldId=world'))).status,
    ).toBe(401);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it('passes only server session identity and applies read rate limit', async () => {
    expect(
      (await GET(new Request('http://localhost/api/kingdoms/reports?worldId=world'))).status,
    ).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith({ worldId: 'world' }, { id: 'owner', tokenVersion: 3 });
    expect(mocks.rate).toHaveBeenCalledWith('owner', false);
  });
  it('rejects cross-origin read-status mutations before persistence', async () => {
    const result = await PATCH(
      new Request('http://localhost/api/kingdoms/reports', {
        method: 'PATCH',
        headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
        body: '{}',
      }),
    );
    expect(result.status).toBe(403);
    expect(mocks.mark).not.toHaveBeenCalled();
  });
  it('bounds pagination and filters to supported values', () => {
    for (const q of [
      { limit: 5000 },
      { category: 'secret' },
      { q: 'x'.repeat(121) },
      { cursor: 'x'.repeat(401) },
      { playerId: 'other' },
    ])
      expect(reportsQuerySchema.safeParse({ worldId: 'world', ...q }).success).toBe(false);
  });
  it('preserves server denial for foreign report details', async () => {
    mocks.detail.mockRejectedValue(new KingdomsHttpError(404, 'missing'));
    expect(
      (
        await DETAIL(new Request('http://localhost/api/kingdoms/reports/r2?worldId=world'), {
          params: Promise.resolve({ reportId: 'r2' }),
        })
      ).status,
    ).toBe(404);
    expect(mocks.detail).toHaveBeenCalledWith('world', 'r2', { id: 'owner', tokenVersion: 3 });
  });
  it('rate limits mutations and validates JSON content type', async () => {
    vi.stubEnv('NEXTAUTH_URL', 'http://localhost');
    expect(
      (
        await PATCH(
          new Request('http://localhost/api/kingdoms/reports', {
            method: 'PATCH',
            headers: { origin: 'http://localhost', 'content-type': 'text/plain' },
            body: '{}',
          }),
        )
      ).status,
    ).toBe(415);
    expect(mocks.mark).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { GET, POST } from './route';
import { AlfazaaHttpError } from '@/lib/alfazaa/server/http';
const seam = vi.hoisted(() => ({
  identity: vi.fn(),
  rate: vi.fn(),
  read: vi.fn(),
  command: vi.fn(),
}));
vi.mock('@/lib/alfazaa/server/identity', () => ({
  alfazaaIdentity: seam.identity,
  alfazaaRateLimit: seam.rate,
}));
vi.mock('@/lib/alfazaa/server/world-repository', () => ({
  readAlfazaaWorld: seam.read,
  commandAlfazaaWorld: seam.command,
}));
const request = (
  body: unknown = {},
  origin = 'http://localhost:3000',
  contentType = 'application/json',
) =>
  new Request('http://localhost:3000/api/alfazaa/world', {
    method: 'POST',
    headers: { origin, 'content-type': contentType },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXTAUTH_URL', 'http://localhost:3000');
  seam.identity.mockResolvedValue({ id: 'alice', tokenVersion: 0 });
  seam.rate.mockResolvedValue(undefined);
  seam.read.mockResolvedValue({ revision: 0 });
  seam.command.mockResolvedValue({ revision: 1 });
});
afterEach(() => vi.unstubAllEnvs());
describe('shared-world HTTP transport guards', () => {
  it('requires identity for reads and writes and no-stores account projections', async () => {
    expect((await GET()).headers.get('cache-control')).toBe('no-store');
    seam.identity.mockRejectedValue(new AlfazaaHttpError(401, 'سجّل الدخول'));
    expect((await GET()).status).toBe(401);
    expect((await POST(request())).status).toBe(401);
    expect(seam.command).not.toHaveBeenCalled();
  });
  it('rejects foreign origin, invalid body formats and over-limit payloads before persistence', async () => {
    expect((await POST(request({}, 'https://evil.invalid'))).status).toBe(403);
    expect((await POST(request({}, 'http://localhost:3000', 'text/plain'))).status).toBe(415);
    expect((await POST(request({ value: 'x'.repeat(33000) }))).status).toBe(413);
    expect(seam.command).not.toHaveBeenCalled();
  });
  it('rate-limits account commands and forwards only the authenticated identity', async () => {
    const command = {
      idempotencyKey: 'world-test',
      expectedRevision: 0,
      command: { type: 'join', name: 'النور' },
    };
    const response = await POST(request(command));
    expect(response.status).toBe(200);
    expect(seam.command).toHaveBeenCalledWith({ id: 'alice', tokenVersion: 0 }, command);
    seam.rate.mockRejectedValue(new AlfazaaHttpError(429, 'انتظر قليلًا'));
    expect((await POST(request(command))).status).toBe(429);
  });
});

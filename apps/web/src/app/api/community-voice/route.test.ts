import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';
import { POST as command } from './[roomId]/route';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  command: vi.fn(),
}));
vi.mock('@/lib/auth/session', () => ({ getCurrentSession: mocks.session }));
vi.mock('@/lib/community-voice/repository', () => ({
  listVoiceRooms: mocks.list,
  createVoiceRoom: mocks.create,
  commandVoiceRoom: mocks.command,
}));
const clientId = '11111111-1111-4111-8111-111111111111';
const request = (
  body: unknown,
  origin = 'http://localhost:3000',
  headers: Record<string, string> = {},
) =>
  new Request('http://localhost:3000/api/community-voice', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: 'user', tokenVersion: 3, role: 'OWNER' } });
  mocks.list.mockResolvedValue([]);
  mocks.create.mockResolvedValue({ room: {} });
  mocks.command.mockResolvedValue({ room: {} });
});

describe('voice HTTP boundaries', () => {
  it('requires a current session before listing or creating rooms', async () => {
    mocks.session.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await POST(request({ name: 'مجلس الأصدقاء', clientId }))).status).toBe(401);
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('rejects cross-origin, missing-origin, and non-JSON mutations before invoking room commands', async () => {
    for (const origin of ['https://attacker.example', 'null', ''])
      expect((await POST(request({ name: 'مجلس الأصدقاء', clientId }, origin))).status).toBe(403);
    expect(
      (
        await POST(
          request({ name: 'مجلس الأصدقاء', clientId }, 'http://localhost:3000', {
            'Content-Type': 'text/plain',
          }),
        )
      ).status,
    ).toBe(415);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('accepts a bounded room command and passes only server session identity', async () => {
    const response = await command(request({ type: 'heartbeat', clientId, cursor: 4 }), {
      params: Promise.resolve({ roomId: '123456789' }),
    });
    expect(response.status).toBe(200);
    expect(mocks.command).toHaveBeenCalledWith(
      '123456789',
      { userId: 'user', tokenVersion: 3 },
      { type: 'heartbeat', clientId, cursor: 4 },
    );
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('rejects forged privilege fields and oversized streaming payloads', async () => {
    expect(
      (
        await command(request({ type: 'join', clientId, role: 'HOST' }), {
          params: Promise.resolve({ roomId: 'room' }),
        })
      ).status,
    ).toBe(400);
    expect((await POST(request({ name: 'x'.repeat(33_000), clientId }))).status).toBe(413);
    expect(mocks.command).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('never returns server exception details or connection secrets', async () => {
    mocks.list.mockRejectedValue(new Error('postgres://private-password@database.internal'));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private-password');
  });
});

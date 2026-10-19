import { beforeEach, expect, it, vi } from 'vitest';
import { POST, GET } from '@/app/api/voice/rooms/[roomId]/events/route';
const mocks = vi.hoisted(() => ({
  command: vi.fn(),
  sync: vi.fn(),
  read: vi.fn(),
  announce: vi.fn(),
}));
vi.mock('./identity', () => ({
  voiceIdentity: async () => ({ id: 'self' }),
  voiceRateLimit: vi.fn(),
}));
vi.mock('./repository', () => ({ sendVoiceEvent: mocks.command, getVoiceSnapshot: mocks.read }));
vi.mock('./media-sync', () => ({ synchronizeVoiceMedia: mocks.sync }));
vi.mock('./notifications', () => ({ announceVoiceChange: mocks.announce }));
const context = { params: Promise.resolve({ roomId: 'room' }) };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXTAUTH_URL', 'https://voice.test');
  mocks.command.mockResolvedValue({ cursor: 1, messages: [{ id: 'confirmed' }] });
  mocks.read.mockResolvedValue({ cursor: 2 });
  mocks.sync.mockImplementation(async (_id, value) => value);
  mocks.announce.mockImplementation((value) => value);
});
it.each([
  { type: 'gift', giftId: 'rose', recipientId: 'other' },
  { type: 'mute', muted: true },
  { type: 'message', text: 'أهلًا' },
])('responds to $type without waiting for any SFU network RPC', async (event) => {
  mocks.sync.mockImplementation(() => new Promise(() => {}));
  const response = await POST(
    new Request('https://voice.test/api/voice/rooms/room/events', {
      method: 'POST',
      headers: { origin: 'https://voice.test', 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    }),
    context,
  );
  expect(response.status).toBe(200);
  expect(mocks.sync).not.toHaveBeenCalled();
  expect(mocks.announce).toHaveBeenCalledWith(
    { cursor: 1, messages: [{ id: 'confirmed' }] },
    event.type === 'mute' ? undefined : 'confirmed',
  );
});
it('keeps authoritative permission reconciliation on moderator mute and coalesces periodic checks', async () => {
  await POST(
    new Request('https://voice.test/api/voice/rooms/room/events', {
      method: 'POST',
      headers: { origin: 'https://voice.test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'moderator-mute', userId: 'other', muted: true }),
    }),
    context,
  );
  expect(mocks.sync).toHaveBeenCalledWith('room', { cursor: 1, messages: [{ id: 'confirmed' }] });
  await GET(new Request('https://voice.test'), context);
  expect(mocks.sync).toHaveBeenCalledWith('room', { cursor: 2 }, true);
});

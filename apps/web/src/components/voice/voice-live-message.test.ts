import { expect, it } from 'vitest';
import type { VoiceSnapshot } from '@/lib/voice/types';
import {
  readVoiceLiveMessage,
  withLiveMessages,
  type VoiceLiveMessage,
} from './voice-live-message';
const message = {
  id: 'msg',
  userId: 'sender',
  name: 'عضو',
  image: null,
  text: 'أهلًا',
  createdAt: 1,
  replyTo: null,
  pinned: false,
  reactions: {},
};
const packet: VoiceLiveMessage = { roomId: 'room', cursor: 12, message };
const snapshot = {
  room: { id: 'room', active: true },
  me: { id: 'me' },
  cursor: 10,
  messages: [],
} as unknown as VoiceSnapshot;
it('validates packet shape, current room, sizes and trusted-message fields', () => {
  const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
  expect(readVoiceLiveMessage(bytes(packet), 'room')).toEqual(packet);
  expect(readVoiceLiveMessage(bytes(packet), 'other')).toBeNull();
  expect(
    readVoiceLiveMessage(
      bytes({ ...packet, message: { ...message, text: 'x'.repeat(1001) } }),
      'room',
    ),
  ).toBeNull();
  expect(readVoiceLiveMessage(bytes({ ...packet, cursor: Infinity }), 'room')).toBeNull();
});
it('shows a confirmed message immediately without advancing permissions or allowing stale polling to erase it', () => {
  const pending = [packet];
  const live = withLiveMessages(snapshot, pending);
  expect(live.messages).toEqual([message]);
  expect(live.cursor).toBe(10);
  expect(withLiveMessages({ ...snapshot, cursor: 11 }, pending).messages).toEqual([message]);
  expect(
    withLiveMessages({ ...snapshot, cursor: 12, messages: [message] }, pending).messages,
  ).toEqual([message]);
  expect(pending).toHaveLength(0);
});
it('deduplicates notifications and lets authoritative deletion or revoked membership remove messages', () => {
  const pending = [packet, packet];
  expect(withLiveMessages(snapshot, pending).messages).toHaveLength(1);
  expect(withLiveMessages({ ...snapshot, cursor: 13 }, pending).messages).toEqual([]);
  const next = [packet];
  expect(withLiveMessages({ ...snapshot, me: null }, next).messages).toEqual([]);
  expect(next).toHaveLength(0);
});

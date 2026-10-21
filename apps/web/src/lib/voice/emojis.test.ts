import { describe, expect, it } from 'vitest';
import { customEmojiIds, emojiToken, messageEmojiCount } from './emojis';
import { voiceEventSchema, createRoomSchema } from './schemas';
import { applyVoiceEvent, joinVoiceState } from './room-state';
import type { VoiceRoomState } from './types';
const id = 'f2b2e248-8f04-4abe-8c76-a30a07cd2e47';
function room() {
  const host = { id: 'host', name: 'عزيز', image: null };
  const state: VoiceRoomState = {
    settings: createRoomSchema.parse({ name: 'مجلس تحدي' }),
    host,
    createdAt: 0,
    active: true,
    lockedSeats: [],
    participants: [],
    messages: [],
    bannedUsers: [],
  };
  joinVoiceState(state, host, 0);
  return state;
}
describe('emoji wire and server boundaries', () => {
  it('counts compound and custom emojis without counting ZWJ components twice', () => {
    expect(messageEmojiCount(`مرحبا 👨‍👩‍👧‍👦 🇸🇦 1️⃣ ${emojiToken(id)}`)).toBe(4);
    expect(customEmojiIds(`نص ${emojiToken(id)}`)).toEqual([id]);
  });
  it('accepts 12 and rejects 13 emojis and arbitrary reaction URLs or prototypes', () => {
    expect(voiceEventSchema.safeParse({ type: 'message', text: '😂'.repeat(12) }).success).toBe(
      true,
    );
    expect(voiceEventSchema.safeParse({ type: 'message', text: '😂'.repeat(13) }).success).toBe(
      false,
    );
    for (const emoji of ['__proto__', 'https://evil.test/a.webp', '<img onerror=x>', ':td_bad:'])
      expect(voiceEventSchema.safeParse({ type: 'reaction', messageId: 'm', emoji }).success).toBe(
        false,
      );
  });
  it('rejects unavailable custom assets and non-members server-side', () => {
    const state = room();
    expect(() =>
      applyVoiceEvent(state, 'host', { type: 'message', text: emojiToken(id) }, 1000, 'm'),
    ).toThrow();
    expect(() =>
      applyVoiceEvent(state, 'outsider', { type: 'message', text: '😂' }, 1000, 'm'),
    ).toThrow();
    expect(state.messages).toHaveLength(0);
  });
  it('preserves the opaque token, request ID and existing per-user message throttle', () => {
    const state = room();
    applyVoiceEvent(
      state,
      'host',
      { type: 'message', text: `هلا ${emojiToken(id)}`, requestId: id },
      1000,
      'm',
      new Set([id]),
    );
    expect(state.messages[0]).toMatchObject({
      text: `هلا ${emojiToken(id)}`,
      clientId: id,
    });
    expect(() =>
      applyVoiceEvent(state, 'host', { type: 'message', text: '😂' }, 1500, 'm2'),
    ).toThrow();
  });
  it('supports custom reactions and removes empty reactions, including disabled-chat checks', () => {
    const state = room();
    applyVoiceEvent(state, 'host', { type: 'message', text: 'هلا' }, 1000, 'm');
    const event = {
      type: 'reaction' as const,
      messageId: 'm',
      emoji: emojiToken(id),
    };
    applyVoiceEvent(state, 'host', event, 2000, 'unused', new Set([id]));
    expect(state.messages[0].reactions[emojiToken(id)]).toEqual(['host']);
    applyVoiceEvent(state, 'host', event, 2000, 'unused', new Set([id]));
    expect(state.messages[0].reactions).toEqual({});
    state.settings.chatEnabled = false;
    expect(() => applyVoiceEvent(state, 'host', event, 2000, 'unused', new Set([id]))).toThrow();
  });
});

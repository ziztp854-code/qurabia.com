import { describe, expect, it } from 'vitest';
import {
  applyVoiceEvent,
  joinVoiceState,
  leaveVoiceState,
  pruneVoicePresence,
  voiceSnapshot,
  VOICE_PRESENCE_TTL,
} from './room-state';
import { createRoomSchema, voiceCoverSchema, voiceEventSchema } from './schemas';
import type { VoiceEvent, VoiceRoomState } from './types';
const now = 1_800_000_000_000;
const host = { id: 'host', name: 'المضيف', image: null };
function room(): VoiceRoomState {
  const state: VoiceRoomState = {
    settings: createRoomSchema.parse({ name: 'مجلس الاختبار' }),
    host,
    createdAt: now,
    active: true,
    lockedSeats: [],
    participants: [],
    messages: [],
    bannedUsers: [],
  };
  joinVoiceState(state, host, now);
  joinVoiceState(state, { id: 'alice', name: 'عائشة', image: null }, now);
  joinVoiceState(state, { id: 'bob', name: 'بدر', image: null }, now);
  return state;
}
const event = (state: VoiceRoomState, id: string, command: VoiceEvent, time = now) =>
  applyVoiceEvent(state, id, command, time, `msg-${time}`);
function seat(state: VoiceRoomState, userId: string, index: number) {
  event(state, userId, { type: 'request-seat', seatIndex: index });
  event(state, 'host', { type: 'approve-seat', userId, seatIndex: index });
}
describe('voice server room permissions', () => {
  it('starts with true account identities, a muted host and listener privileges', () => {
    const state = room();
    expect(state.participants.map((p) => [p.id, p.role, p.seatIndex, p.muted])).toEqual([
      ['host', 'host', 0, true],
      ['alice', 'listener', null, true],
      ['bob', 'listener', null, true],
    ]);
    expect(voiceSnapshot('room', state, 3, 'alice').room.participantCount).toBe(3);
  });
  it('never exposes account session versions in public snapshots', () => {
    const state = room();
    state.participants.forEach((participant) => {
      participant.tokenVersion = 42;
    });
    state.mediaGrants = {
      host: { active: true, canPublish: true, tokenVersion: 42, joinedAt: now, revokedBefore: 0 },
    };
    const snapshot = voiceSnapshot('room', state, 1, 'host');
    expect(JSON.stringify(snapshot)).not.toContain('tokenVersion');
    expect(JSON.stringify(snapshot)).not.toContain('mediaGrants');
    expect(state.participants[0].tokenVersion).toBe(42);
  });
  it('rejects listener publication, moderation, room closing and arbitrary role changes', () => {
    const state = room();
    const forbidden: VoiceEvent[] = [
      { type: 'mute', muted: false },
      { type: 'approve-seat', userId: 'alice', seatIndex: 1 },
      { type: 'role', userId: 'alice', role: 'moderator' },
      { type: 'lock-seat', seatIndex: 1, locked: true },
      { type: 'remove', userId: 'bob' },
      { type: 'close' },
    ];
    for (const action of forbidden) expect(() => event(state, 'alice', action)).toThrow();
  });
  it('requires microphone consent and prevents seat takeover', () => {
    const state = room();
    expect(() =>
      event(state, 'host', { type: 'approve-seat', userId: 'alice', seatIndex: 1 }),
    ).toThrow('لم يطلب');
    seat(state, 'alice', 1);
    event(state, 'bob', { type: 'request-seat', seatIndex: 1 });
    expect(() =>
      event(state, 'host', { type: 'approve-seat', userId: 'bob', seatIndex: 1 }),
    ).toThrow('مشغول');
    expect(state.participants.find((p) => p.id === 'alice')?.role).toBe('speaker');
  });
  it('enforces moderator mute until moderator releases it; never turns microphone on remotely', () => {
    const state = room();
    seat(state, 'alice', 1);
    event(state, 'alice', { type: 'mute', muted: false });
    event(state, 'host', { type: 'moderator-mute', userId: 'alice', muted: true });
    expect(() => event(state, 'alice', { type: 'mute', muted: false })).toThrow();
    event(state, 'host', { type: 'moderator-mute', userId: 'alice', muted: false });
    expect(state.participants.find((p) => p.id === 'alice')?.muted).toBe(true);
    event(state, 'alice', { type: 'mute', muted: false });
    expect(state.participants.find((p) => p.id === 'alice')?.muted).toBe(false);
  });
  it('protects hosts and peer moderators, and respects granted moderation policy', () => {
    const state = room();
    event(state, 'host', { type: 'role', userId: 'alice', role: 'moderator' });
    event(state, 'host', { type: 'role', userId: 'bob', role: 'moderator' });
    expect(() => event(state, 'alice', { type: 'remove', userId: 'host' })).toThrow();
    expect(() =>
      event(state, 'alice', { type: 'moderator-mute', userId: 'bob', muted: true }),
    ).toThrow();
    state.settings.moderatorsCanManage = false;
    expect(() =>
      event(state, 'alice', { type: 'lock-seat', seatIndex: 1, locked: true }),
    ).toThrow();
  });
  it('locks empty seats and prevents locking occupied seats', () => {
    const state = room();
    event(state, 'host', { type: 'lock-seat', seatIndex: 1, locked: true });
    expect(() => event(state, 'alice', { type: 'request-seat', seatIndex: 1 })).toThrow('مقفل');
    expect(() => event(state, 'host', { type: 'lock-seat', seatIndex: 0, locked: true })).toThrow(
      'أفرغ',
    );
  });
  it('demotes and removes server permissions, blocks removed users from rejoining', () => {
    const state = room();
    seat(state, 'alice', 1);
    event(state, 'host', { type: 'role', userId: 'alice', role: 'listener' });
    expect(state.participants.find((p) => p.id === 'alice')?.seatIndex).toBeNull();
    event(state, 'host', { type: 'remove', userId: 'alice' });
    expect(() => joinVoiceState(state, { id: 'alice', name: 'عائشة', image: null }, now)).toThrow();
  });
  it('leaving the seat revokes speech but retains moderator role', () => {
    const state = room();
    event(state, 'host', { type: 'role', userId: 'alice', role: 'moderator' });
    event(state, 'alice', { type: 'request-seat', seatIndex: 2 });
    event(state, 'alice', { type: 'leave-seat' });
    expect(state.participants.find((p) => p.id === 'alice')).toMatchObject({
      role: 'moderator',
      seatIndex: null,
      muted: true,
    });
  });
  it('supports chat replies, reactions, exclusive pins and author/moderator deletion', () => {
    const state = room();
    event(state, 'alice', { type: 'message', text: '<script>alert(1)</script>' });
    event(state, 'bob', { type: 'message', text: 'رد', replyTo: `msg-${now}` }, now + 1001);
    expect(state.messages[1].replyTo).toBe(state.messages[0].id);
    event(state, 'bob', { type: 'reaction', messageId: state.messages[0].id, emoji: '❤️' });
    expect(state.messages[0].reactions['❤️']).toEqual(['bob']);
    event(state, 'bob', { type: 'reaction', messageId: state.messages[0].id, emoji: '❤️' });
    expect(state.messages[0].reactions['❤️']).toEqual([]);
    expect(() =>
      event(state, 'bob', { type: 'pin-message', messageId: state.messages[0].id, pinned: true }),
    ).toThrow();
    event(state, 'host', { type: 'pin-message', messageId: state.messages[0].id, pinned: true });
    event(state, 'host', { type: 'pin-message', messageId: state.messages[1].id, pinned: true });
    expect(state.messages.filter((m) => m.pinned)).toHaveLength(1);
    expect(() =>
      event(state, 'bob', { type: 'delete-message', messageId: state.messages[0].id }),
    ).toThrow();
    event(state, 'alice', { type: 'delete-message', messageId: state.messages[0].id });
    expect(state.messages).toHaveLength(1);
  });
  it('enforces chat disabled, slow mode and existing reply target', () => {
    const state = room();
    state.settings.chatEnabled = false;
    expect(() => event(state, 'alice', { type: 'message', text: 'ممنوع' })).toThrow();
    state.settings.chatEnabled = true;
    expect(() =>
      event(state, 'alice', { type: 'message', text: 'رد', replyTo: 'missing' }),
    ).toThrow();
    event(state, 'alice', { type: 'message', text: 'رسالة' });
    expect(() => event(state, 'alice', { type: 'message', text: 'مكرر' })).toThrow('انتظر');
  });
  it('filters blocked chat and expires absent participants so counts never simulate listeners', () => {
    const state = room();
    event(state, 'alice', { type: 'message', text: 'رسالة' });
    expect(voiceSnapshot('room', state, 1, 'bob', false, ['alice']).messages).toEqual([]);
    state.participants[0].lastSeenAt = now + 100;
    pruneVoicePresence(state, now + VOICE_PRESENCE_TTL + 1);
    expect(state.participants.map((p) => p.id)).toEqual(['host']);
  });
  it('preserves the room and other participants across host disconnect/refresh', () => {
    const state = room();
    leaveVoiceState(state, 'host');
    expect(state.active).toBe(true);
    expect(state.participants.map((p) => p.id)).toEqual(['alice', 'bob']);
    joinVoiceState(state, host, now + 1000);
    expect(state.participants.find((p) => p.id === host.id)).toMatchObject({
      role: 'host',
      seatIndex: 0,
      muted: true,
    });
  });
  it('only explicit host close ends the room and removes all participants', () => {
    const state = room();
    event(state, 'host', { type: 'close' });
    expect(state.active).toBe(false);
    expect(state.participants).toHaveLength(0);
    expect(() => joinVoiceState(state, host, now)).toThrow('انتهى');
    expect(() => event(state, 'alice', { type: 'hand', raised: true })).toThrow(
      expect.objectContaining({ status: 410, code: 'ROOM_CLOSED' }),
    );
  });
});
describe('voice input boundaries', () => {
  it('rejects remote/svg/path traversal covers, forged identity/role and oversized text', () => {
    for (const value of [
      'https://example.com/a.webp',
      '/voice/covers/../friends.webp',
      '/voice/covers/friends.svg',
      '/uploads/voice/anything.webp',
    ])
      expect(voiceCoverSchema.safeParse(value).success).toBe(false);
    expect(voiceCoverSchema.safeParse('/voice/covers/friends.webp').success).toBe(true);
    expect(
      voiceCoverSchema.safeParse('/api/voice/covers/2819cbea-dc71-4eca-bfa5-6999940ec10e').success,
    ).toBe(true);
    expect(voiceEventSchema.safeParse({ type: 'message', text: 'x', userId: 'host' }).success).toBe(
      false,
    );
    expect(
      voiceEventSchema.safeParse({ type: 'role', userId: 'alice', role: 'host' }).success,
    ).toBe(false);
    expect(voiceEventSchema.safeParse({ type: 'message', text: 'x'.repeat(1001) }).success).toBe(
      false,
    );
  });
});

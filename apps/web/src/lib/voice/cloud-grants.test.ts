import type { VoiceParticipant, VoiceRoomState } from './types';
import { expect, it } from 'vitest';
import { markChangedCloudGrants, voiceMediaStateKey } from './cloud-grants';

it('keeps a generation quarantined when permissions change and then revert', () => {
  const member = { id: 'u', role: 'speaker', seatIndex: 0, moderatorMuted: false, tokenVersion: 0, joinedAt: 1, membershipId: 'm' } as unknown as VoiceParticipant;
  const state = { active: true, participants: [{ ...member, moderatorMuted: true }], mediaGrants: { old: { active: true, userId: 'u', canPublish: true, tokenVersion: 0, joinedAt: 1, membershipId: 'm', revokedBefore: 0 } } } as unknown as VoiceRoomState;
  markChangedCloudGrants(state);
  expect(state.mediaGrants!.old.revoking).toBe(true);
  state.participants = [member];
  markChangedCloudGrants(state);
  expect(state.mediaGrants!.old.revoking).toBe(true);
});

it('ignores routine reactions while detecting membership and microphone rights', () => {
  const member = { id: 'u', role: 'speaker', seatIndex: 0, moderatorMuted: false, joinedAt: 1, membershipId: 'm' } as unknown as VoiceParticipant;
  const original = { active: true, participants: [member] } as unknown as VoiceRoomState;
  expect(voiceMediaStateKey({ ...original, participants: [{ ...member, handRaised: true }] })).toBe(voiceMediaStateKey(original));
  expect(voiceMediaStateKey({ ...original, participants: [{ ...member, moderatorMuted: true }] })).not.toBe(voiceMediaStateKey(original));
  expect(voiceMediaStateKey({ ...original, participants: [] })).not.toBe(voiceMediaStateKey(original));
});

import { describe, expect, it } from 'vitest';
import type { PublicIdentity } from '@/lib/community/contracts';
import { applyVoiceCommand, newVoiceState, validateVoiceSignal, type VoiceActor } from './engine';

function actor(userId: string, accountNumber: number): VoiceActor {
  const identity: PublicIdentity = {
    userId, accountNumber, name: userId, username: null, avatarUrl: null,
    badges: [], frame: null, effect: null, primaryBadge: null,
  };
  return { userId, tokenVersion: 0, platformModerator: false, identity };
}

describe('voice authority regression cases: independent QA', () => {
  it('rejects ambiguous session SDP directions that Chrome resolves to publishing', () => {
    // Real Chromium accepts this ordering and negotiates sendrecv. Reading only the
    // first direction would incorrectly authorize it as a receive-only answer.
    const ambiguous = 'v=0\r\na=recvonly\r\na=sendrecv\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
    expect(() => validateVoiceSignal('answer', ambiguous, false)).toThrow();
  });

  it.each(['recvonly', 'inactive'])('does not inherit session-only %s that Chromium ignores', (direction) => {
    const sessionOnly = `v=0\r\na=${direction}\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n`;
    expect(() => validateVoiceSignal('answer', sessionOnly, false)).toThrow();
  });

  it.each(['sendrecv:ignored', 'sendrecv ignored'])('rejects media direction suffix %s that Chromium treats as publishing', (suffix) => {
    const differential = `v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=recvonly\r\na=${suffix}\r\n`;
    expect(() => validateVoiceSignal('answer', differential, false)).toThrow();
  });

  it('does not let a room moderator bypass host protection through seat approval', () => {
    const state = newVoiceState();
    const room = { ownerId: 'owner', status: 'OPEN' };
    const owner = actor('owner', 1);
    const moderator = actor('moderator', 123456789);
    const ownerClient = '11111111-1111-4111-8111-111111111111';
    const moderatorClient = '22222222-2222-4222-8222-222222222222';
    const now = 1_800_000_000_000;
    applyVoiceCommand(state, room, owner, { type: 'join', clientId: ownerClient }, now);
    applyVoiceCommand(state, room, moderator, { type: 'join', clientId: moderatorClient }, now);
    const hostMember = state.members.find((member) => member.role === 'HOST')!;
    const moderatorMember = state.members.find((member) => member.identity.userId === 'moderator')!;
    applyVoiceCommand(state, room, owner, {
      type: 'moderator', clientId: ownerClient, memberId: moderatorMember.id, enabled: true,
    }, now);
    expect(() => applyVoiceCommand(state, room, moderator, {
      type: 'approve-seat', clientId: moderatorClient, memberId: hostMember.id, seat: 1,
    }, now)).toThrow();
    expect(hostMember.seat).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { createVoiceRoomSchema, voiceCommandSchema } from './schema';

const clientId = '11111111-1111-4111-8111-111111111111';
const memberId = '22222222-2222-4222-8222-222222222222';

describe('voice command input boundaries: independent QA', () => {
  it('rejects client assertions of server-assigned identity or host privileges', () => {
    expect(voiceCommandSchema.safeParse({ type: 'join', clientId, userId: 'victim', role: 'HOST' }).success).toBe(false);
    expect(voiceCommandSchema.safeParse({ type: 'join', clientId, identity: { badges: ['founder'] } }).success).toBe(false);
    expect(createVoiceRoomSchema.safeParse({ name: 'غرفة المجلس', clientId, ownerId: 'victim' }).success).toBe(false);
  });

  it('rejects out-of-bounds microphone seats and missing/invalid target identities', () => {
    expect(voiceCommandSchema.safeParse({ type: 'approve-seat', clientId, memberId, seat: 6 }).success).toBe(false);
    expect(voiceCommandSchema.safeParse({ type: 'approve-seat', clientId, memberId, seat: -1 }).success).toBe(false);
    expect(voiceCommandSchema.safeParse({ type: 'mute', clientId, memberId: '../../other-room', muted: true }).success).toBe(false);
  });

  it('bounds signaling transport and rejects attempts to broadcast or inject sender IDs', () => {
    const signal = { type: 'signal', clientId, targetMemberId: memberId, kind: 'offer', payload: 'v=0\r\n' };
    expect(voiceCommandSchema.safeParse(signal).success).toBe(true);
    expect(voiceCommandSchema.safeParse({ ...signal, targetMemberId: '*' }).success).toBe(false);
    expect(voiceCommandSchema.safeParse({ ...signal, from: 'other-member' }).success).toBe(false);
    expect(voiceCommandSchema.safeParse({ ...signal, payload: 'x'.repeat(24_001) }).success).toBe(false);
  });

  it('rejects unbounded chat and arbitrary reaction/asset injection', () => {
    expect(voiceCommandSchema.safeParse({ type: 'chat', clientId, text: 'x'.repeat(501) }).success).toBe(false);
    expect(voiceCommandSchema.safeParse({ type: 'reaction', clientId, reaction: '<img src=x onerror=alert(1)>' }).success).toBe(false);
    for (const imageUrl of ['javascript:alert(1)', 'data:image/svg+xml,<svg onload="alert(1)"/>', 'https://attacker.test/x.svg']) {
      expect(createVoiceRoomSchema.safeParse({ name: 'غرفة المجلس', clientId, imageUrl }).success).toBe(false);
    }
  });
});

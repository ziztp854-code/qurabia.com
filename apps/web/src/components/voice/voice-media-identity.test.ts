import { expect, it } from 'vitest';
import { voiceUserIdForParticipant } from './voice-media-identity';

it('maps server-provided generation metadata to the account', () => {
  expect(voiceUserIdForParticipant('voice-11111111-1111-4111-8111-111111111111', '{"voiceUserId":"user-a"}')).toBe('user-a');
});
it('refuses a generation with missing or malformed account metadata', () => {
  expect(voiceUserIdForParticipant('voice-11111111-1111-4111-8111-111111111111', '{}')).toBeNull();
  expect(voiceUserIdForParticipant('voice-11111111-1111-4111-8111-111111111111', 'invalid')).toBeNull();
});
it('preserves legacy gateway identities', () => {
  expect(voiceUserIdForParticipant('user-a', '')).toBe('user-a');
});

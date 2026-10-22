import assert from 'node:assert/strict';
import test from 'node:test';
import { mayPublishVoice, readVoiceGrant, retryDelay, terminalVoiceError } from './policy';

const member = { id: 'member', seatIndex: 0, role: 'speaker', moderatorMuted: false, muted: true };
test('server seat, role and moderator restrictions gate publication', () => {
  assert.equal(mayPublishVoice(member), true);
  assert.equal(mayPublishVoice(null), false);
  assert.equal(mayPublishVoice({ ...member, seatIndex: null }), false);
  assert.equal(mayPublishVoice({ ...member, role: 'listener' }), false);
  assert.equal(mayPublishVoice({ ...member, moderatorMuted: true }), false);
});
test('media endpoints require WSS without credentials or embedded URL tokens', () => {
  assert.deepEqual(readVoiceGrant({ token: 'jwt', url: 'wss://voice.example/', canPublish: false }),
    { token: 'jwt', url: 'wss://voice.example/', canPublish: false });
  for (const url of ['ws://voice.example/', 'https://voice.example/', 'wss://u:p@voice.example/', 'wss://voice.example/?token=x', 'wss://voice.example/#x'])
    assert.throws(() => readVoiceGrant({ token: 'jwt', url }));
  assert.throws(() => readVoiceGrant({ url: 'wss://voice.example/' }));
});
test('revoked membership and unconfigured media stop automatic retries', () => {
  for (const status of [400, 401, 403, 404, 410]) assert.equal(terminalVoiceError({ status }), true);
  assert.equal(terminalVoiceError({ status: 503, code: 'MEDIA_SETUP_REQUIRED' }), true);
  assert.equal(terminalVoiceError({ status: 503 }), false);
  assert.equal(terminalVoiceError({ status: 409, code: 'MEDIA_RETRY' }), false);
  assert.equal(terminalVoiceError(new Error('offline')), false);
});
test('connection retry budget is bounded with increasing delays', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(retryDelay), [1000, 2000, 4000, 8000, null, null]);
});

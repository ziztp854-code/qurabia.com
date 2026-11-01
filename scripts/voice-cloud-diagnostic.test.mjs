import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signalFailureCategory } from './voice-cloud-diagnostic.mjs';

test('classifies only known signaling errors and never exposes unknown messages', () => {
  assert.equal(signalFailureCategory(new Error('Signal join rejected')), 'signal_rejected');
  assert.equal(signalFailureCategory(new Error('Signal join timed out')), 'signal_timeout');
  assert.equal(
    signalFailureCategory(new Error('Revoked token did not receive an authentication rejection')),
    'rejected_without_http_401',
  );
  assert.equal(
    signalFailureCategory(new Error('Revoked token unexpectedly rejoined')),
    'unexpected_join',
  );
  assert.equal(signalFailureCategory(new Error('sensitive token text')), 'other');
  assert.equal(signalFailureCategory(null), 'other');
});

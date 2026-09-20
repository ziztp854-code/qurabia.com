import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveNotificationJoinUrl } from './notification-data';

test('accepts only the documented room join payload', () => {
  assert.equal(
    resolveNotificationJoinUrl({ type: 'join_room', roomCode: ' ab234c ' }),
    'tahaddi://join/AB234C',
  );
});

test('rejects arbitrary links, invalid codes, and unrelated payloads', () => {
  assert.equal(resolveNotificationJoinUrl({ type: 'open_url', url: 'https://example.com' }), null);
  assert.equal(resolveNotificationJoinUrl({ type: 'join_room', roomCode: 'ABC01' }), null);
  assert.equal(
    resolveNotificationJoinUrl({
      type: 'join_room',
      roomCode: 'AB234C',
      url: 'https://example.com',
    }),
    null,
  );
  assert.equal(resolveNotificationJoinUrl(null), null);
});

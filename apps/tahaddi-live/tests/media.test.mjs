import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MediaSession } from '../public/media.js';

test('leaving releases device tracks and peer connections and permits rejoining', async () => {
  const stopped = [], closed = [];
  const track = { kind: 'audio', enabled: true, stop: () => stopped.push('audio') };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track], getVideoTracks: () => [] };
  const session = new MediaSession({ send: () => {}, mediaDevices: { getUserMedia: async () => stream }, onRemote: () => {} });
  await session.enable('voice');
  session.peers.set('other', { close: () => closed.push('other') });
  session.close();
  assert.deepEqual(stopped, ['audio']);
  assert.deepEqual(closed, ['other']);
  assert.equal(session.stream, null);
  assert.equal(session.peers.size, 0);
  await session.enable('voice');
  assert.equal(session.stream, stream);
  session.close();
});

test('leaving during a pending permission request releases the late stream', async () => {
  let resolveStream;
  let stopped = 0;
  const session = new MediaSession({ send: () => {}, mediaDevices: { getUserMedia: () => new Promise(resolve => { resolveStream = resolve; }) }, onRemote: () => {} });
  const pending = session.enable('voice');
  session.close();
  resolveStream({ getTracks: () => [{ stop: () => stopped++ }] });
  await pending;
  assert.equal(stopped, 1);
  assert.equal(session.stream, null);
});

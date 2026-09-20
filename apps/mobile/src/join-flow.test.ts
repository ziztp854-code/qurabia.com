import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveJoinIntent } from './join-flow';

test('resolves a normalized room code for native navigation', () => {
  assert.deepEqual(resolveJoinIntent(' h7uzt3 '), { roomCode: 'H7UZT3' });
});

test('resolves a supported universal link without opening the website', () => {
  assert.deepEqual(resolveJoinIntent('https://qurabia.com/join/H7UZT3'), {
    roomCode: 'H7UZT3',
  });
});

test('rejects invalid codes and unrelated links', () => {
  assert.equal(resolveJoinIntent('ABC01'), null);
  assert.equal(resolveJoinIntent('https://example.com/join/H7UZT3'), null);
  assert.equal(resolveJoinIntent('https://qurabia.com/extra/join/H7UZT3'), null);
  assert.equal(resolveJoinIntent('tahaddi://attacker/join/H7UZT3'), null);
});

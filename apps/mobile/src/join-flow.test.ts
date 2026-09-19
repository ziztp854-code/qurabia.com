import assert from 'node:assert/strict';
import test from 'node:test';
import { buildQuizJoinUrl } from './join-flow';

test('builds the official join URL from a normalized quiz room code', () => {
  assert.equal(buildQuizJoinUrl(' h7uzt3 '), 'https://qurabia.com/join/H7UZT3');
});

test('rejects codes that cannot identify a quiz room', () => {
  assert.equal(buildQuizJoinUrl('ABC01'), null);
});

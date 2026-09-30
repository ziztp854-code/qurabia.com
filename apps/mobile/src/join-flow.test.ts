import assert from 'node:assert/strict';
import test from 'node:test';
import { roomCodeFromLink, siteUrl } from './join-flow';

test('reads a normalized room code from app and website invite links', () => {
  assert.equal(roomCodeFromLink('tahaddi://join/h7uzt3'), 'H7UZT3');
  assert.equal(roomCodeFromLink('https://qurabia.com/join/H7UZT3?ref=qr'), 'H7UZT3');
  assert.equal(roomCodeFromLink('https://www.qurabia.com/join/h7uzt3'), 'H7UZT3');
});

test('ignores links that cannot identify a quiz room', () => {
  assert.equal(roomCodeFromLink('tahaddi://join/ABC01'), null);
  assert.equal(roomCodeFromLink('https://evil.example/join/H7UZT3'), null);
  assert.equal(roomCodeFromLink(null), null);
});

test('builds official site URLs', () => {
  assert.equal(siteUrl('/privacy'), 'https://qurabia.com/privacy');
  assert.equal(siteUrl('games/ladder'), 'https://qurabia.com/games/ladder');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import type { VoiceMessage, VoiceSnapshot } from '../api/contracts';
import { ChatCommandIds, mergeChat, readVoiceLivePacket, readVoiceRefresh } from './model';
import { emojiAssetPath, emojiToken, messageEmojiCount, tokenizeEmoji, validateMessage } from './emojis';

const message = (id: string, at: number): VoiceMessage => ({
  id, userId: 'member', name: 'عضو', image: null, text: id, createdAt: at,
  replyTo: null, pinned: false, reactions: {},
});
const snapshot = (cursor = 0, messages: VoiceMessage[] = []) => ({
  cursor, messages, room: { id: 'room', active: true }, me: { id: 'me' },
}) as VoiceSnapshot;
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

test('100 duplicate/out-of-order server deliveries produce 100 unique chronological messages', () => {
  const packets = Array.from({ length: 100 }, (_, i) => ({
    roomId: 'room', cursor: i + 1, message: message('message-' + i, i),
  })).reverse();
  const merged = mergeChat(snapshot(), [...packets, ...packets]);
  assert.equal(merged.messages.length, 100);
  assert.equal(new Set(merged.messages.map((item) => item.id)).size, 100);
  assert.equal(merged.messages[0].id, 'message-0');
  assert.equal(merged.messages.at(-1)?.id, 'message-99');
});
test('authoritative newer snapshots remove deleted history and stale deltas', () => {
  const packet = { roomId: 'room', cursor: 2, message: message('deleted', 2) };
  assert.equal(mergeChat(snapshot(1), [packet]).messages.length, 1);
  const afterDeletion = mergeChat(snapshot(3, [message('kept', 1)]), [packet]);
  assert.deepEqual(afterDeletion.messages.map((item) => item.id), ['kept']);
  assert.equal(afterDeletion.pending.length, 0);
});
test('bounded history, room changes, blocks and membership revocation', () => {
  const packets = Array.from({ length: 400 }, (_, i) => ({
    roomId: 'room', cursor: i + 1, message: message('m-' + i, i),
  }));
  assert.equal(mergeChat(snapshot(), packets).pending.length, 200);
  assert.equal(mergeChat(snapshot(), packets).messages[0].id, 'm-200');
  assert.equal(mergeChat(snapshot(), packets, ['member']).messages.length, 0);
  assert.equal(mergeChat({ ...snapshot(), me: null }, packets).messages.length, 0);
  assert.equal(mergeChat({ ...snapshot(), room: { ...snapshot().room, id: 'another' } }, packets).messages.length, 0);
});
test('live parser rejects wrong room, malformed reactions, unknown gifts and oversized data', () => {
  const packet = { roomId: 'room', cursor: 1, message: message('hello', 1) };
  assert.equal(readVoiceLivePacket(encode(packet), 'room')?.message.id, 'hello');
  assert.equal(readVoiceLivePacket(encode(packet), 'another'), null);
  assert.equal(readVoiceLivePacket(encode({ ...packet, message: { ...packet.message, reactions: { hi: [7] } } }), 'room'), null);
  assert.equal(readVoiceLivePacket(encode({ ...packet, message: { ...packet.message, gift: { id: 'paid', recipientId: 'm', recipientName: 'x' } } }), 'room'), null);
  assert.equal(readVoiceLivePacket(new Uint8Array(16_385), 'room'), null);
  assert.equal(readVoiceRefresh(encode({ roomId: 'room', cursor: -1 }), 'room'), false);
  assert.equal(readVoiceRefresh(encode({ roomId: 'room', cursor: 2 }), 'room'), true);
});
test('ambiguous failed writes reuse UUID; acknowledged repeat gets a new UUID', () => {
  let sequence = 0;
  const ids = new ChatCommandIds(() => 'id-' + ++sequence);
  const first = ids.for('message-a');
  assert.equal(ids.for('message-a'), first);
  ids.acknowledge('message-a', 'wrong-response');
  assert.equal(ids.for('message-a'), first);
  ids.acknowledge('message-a', first);
  assert.notEqual(ids.for('message-a'), first);
  assert.notEqual(ids.for('reaction-a'), ids.for('message-a'));
});
test('custom emoji stays opaque, counts graphemes, and cannot inject asset URLs', () => {
  const id = 'a0000000-0000-4000-8000-000000000001';
  const token = emojiToken(id);
  assert.deepEqual(tokenizeEmoji('هلا ' + token + '!'), [
    { type: 'text', text: 'هلا ' }, { type: 'emoji', id }, { type: 'text', text: '!' },
  ]);
  assert.equal(messageEmojiCount('👨‍👩‍👧‍👦' + token), 2);
  assert.equal(emojiAssetPath(id, true), '/api/voice/emojis/assets/' + id + '?still=1');
  assert.throws(() => emojiAssetPath('https://other.example/secret'));
  assert.throws(() => validateMessage(token.repeat(13)));
  assert.equal(validateMessage('  أهلاً  '), 'أهلاً');
});

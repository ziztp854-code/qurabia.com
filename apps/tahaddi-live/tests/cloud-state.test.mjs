import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, reduce } from '../server/cloud-state.mjs';
const setup = () => {
 const s = initialState(); let t = 100000;
 const call = (userId, path, input = {}, method = 'POST') => reduce(s, { path: '/api/' + path, method, input, userId, now: t });
 const session = id => { call(id, 'session'); return call(id, 'connect').clientId; };
 const send = (id, clientId, event, requestId = crypto.randomUUID()) => call(id, 'events', { clientId, event, requestId });
 return { s, call, session, send, advance: ms => t += ms };
};
test('cloud state persists across serialized instances and delivers chat and WebRTC signals', () => {
 const h = setup(), a = h.session('a'), b = h.session('b');
 const r = h.call('a', 'rooms', { title: 'غرفة تحدي', mode: 'voice' }).room;
 h.send('a', a, { type: 'join', roomId: r.id }); h.send('b', b, { type: 'join', roomId: r.id });
 h.send('a', a, { type: 'chat', text: 'أهلًا' });
 h.send('a', a, { type: 'signal', to: 'b', data: { description: { type: 'offer', sdp: 'audio' } } });
 const persisted = JSON.parse(JSON.stringify(h.s));
 const response = reduce(persisted, { path: '/api/events', method: 'GET', userId: 'b', input: { clientId: b }, now: 100000 });
 assert.ok(response.events.some(e => e.event.type === 'chat' && e.event.message.text === 'أهلًا'));
 assert.ok(response.events.some(e => e.event.type === 'signal' && e.event.from === 'a'));
 assert.equal(h.call('a', 'rooms', {}, 'GET').rooms[0].count, 2);
});
test('cloud signaling rejects other rooms and client ownership spoofing', () => {
 const h = setup(), a = h.session('a'), b = h.session('b');
 const room = h.call('a', 'rooms', { title: 'صوت', mode: 'voice' }).room;
 h.send('a', a, { type: 'join', roomId: room.id });
 h.send('a', a, { type: 'signal', to: 'b', data: { candidate: { candidate: 'private' } } });
 assert.equal(h.call('b', 'events', { clientId: b }, 'GET').events.length, 0);
 assert.throws(() => h.call('b', 'events', { clientId: a }, 'GET'), e => e.status === 409);
});
test('cloud capacity, retry deduplication, gifts and departure remain authoritative', () => {
 const h = setup(), clients = ['a','b','c','d','e'].map(id => [id, h.session(id)]);
 const room = h.call('a', 'rooms', { title: 'غرفتنا', mode: 'voice' }).room;
 for (const [id, c] of clients) h.send(id, c, { type: 'join', roomId: room.id });
 assert.equal(h.call('a', 'rooms', {}, 'GET').rooms[0].count, 4);
 const [a, b] = clients;
 h.send('a', a[1], { type: 'pk-start' });
 const gift = { type: 'gift', to: 'b', gift: 'crown' };
 h.send('a', a[1], gift, 'retry-1'); h.send('a', a[1], gift, 'retry-1');
 assert.equal(h.s.users.a.balance, 400); assert.equal(h.s.rooms[room.id].pk.sides.find(p => p.id === 'b').score, 100);
 h.call('b', 'disconnect', { clientId: b[1] });
 assert.equal(h.s.rooms[room.id].pk, null); assert.equal(h.call('a', 'rooms', {}, 'GET').rooms[0].count, 3);
});
test('stale clients leave truthfully and queue cursors do not replay acknowledged events', () => {
 const h = setup(), a = h.session('a'), b = h.session('b');
 const room = h.call('a', 'rooms', { title: 'صوت', mode: 'voice' }).room;
 h.send('a', a, { type: 'join', roomId: room.id }); h.send('b', b, { type: 'join', roomId: room.id });
 const events = h.call('a', 'events', { clientId: a }, 'GET').events;
 assert.equal(h.call('a', 'events', { clientId: a, cursor: events.at(-1).seq }, 'GET').events.length, 0);
 h.advance(46000);
 assert.equal(h.call('a', 'rooms', {}, 'GET').rooms[0].count, 0);
});

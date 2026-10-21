import assert from 'node:assert/strict';
import test from 'node:test';
import type { VoiceEvent, VoiceParticipant, VoiceSnapshot } from '../src/api/contracts';
import { createRoomsApi, roomPath, type ApiRequest } from '../src/rooms/api';
import {
  availableSeat, canManageRoom, canUseMicrophone, createRoomDefaults,
  isMembershipFailure, nextSnapshot,
} from '../src/rooms/state';

// These are client contract/unit tests with injected request results.
// They do not claim to exercise a deployed API, real sessions, or SFU media.
function participant(overrides: Partial<VoiceParticipant> = {}): VoiceParticipant {
  return {
    id: 'temporary-test-user', name: 'عضو اختبار', image: null, role: 'host',
    seatIndex: 0, handRaised: false, requestedSeat: null,
    muted: true, moderatorMuted: false, joinedAt: 1, lastSeenAt: 1,
    ...overrides,
  };
}
function snapshot(overrides: Partial<VoiceSnapshot> = {}): VoiceSnapshot {
  const me = participant();
  return {
    room: {
      ...createRoomDefaults('غرفة اختبار عقد محلي'),
      id: 'test-room', hostId: me.id, hostName: me.name, hostImage: null,
      createdAt: 1, active: true, lockedSeats: [], participantCount: 1,
      listenerCount: 0, speakers: [me], passwordRequired: false,
    },
    me, participants: [me], messages: [], cursor: 10,
    ...overrides,
  };
}

test('room identifiers remain one URL path segment and cannot inject another API route', () => {
  assert.equal(roomPath('room/../other?userId=outsider#fragment'),
    '/api/voice/rooms/room%2F..%2Fother%3FuserId%3Doutsider%23fragment');
  assert.throws(() => roomPath(''));
  assert.throws(() => roomPath('x'.repeat(161)));
});

test('room reads preserve cancellation and distinguish membership heartbeat from snapshot reads', async () => {
  const calls: { path: string; options: Parameters<ApiRequest>[1] }[] = [];
  const response = snapshot();
  const request: ApiRequest = async (path, options) => {
    calls.push({ path, options });
    return response as never;
  };
  const api = createRoomsApi(request);
  const controller = new AbortController();
  assert.equal(await api.snapshot('a/b', controller.signal), response);
  assert.equal(await api.heartbeat('a/b', controller.signal), response);
  await api.list(controller.signal);
  assert.deepEqual(calls.map((call) => call.path), [
    '/api/voice/rooms/a%2Fb',
    '/api/voice/rooms/a%2Fb/events',
    '/api/voice/rooms',
  ]);
  for (const call of calls) {
    assert.equal(call.options?.signal, controller.signal);
    assert.equal(call.options?.method, undefined);
    assert.equal(call.options?.body, undefined);
  }
});

test('creation, admission, leave and settings use existing server routes and keep whole JSON responses', async () => {
  const calls: { path: string; options: Parameters<ApiRequest>[1] }[] = [];
  const response = snapshot();
  const request: ApiRequest = async (path, options) => {
    calls.push({ path, options });
    return response as never;
  };
  const api = createRoomsApi(request);
  const input = createRoomDefaults('مجلس اختبار');
  assert.equal(await api.create(input), response);
  await api.join('test-room', { invite: 'test-only-invite' });
  await api.leave('test-room');
  await api.update('test-room', { chatEnabled: false });
  assert.deepEqual(calls.map(({ path, options }) => [path, options?.method, options?.body]), [
    ['/api/voice/rooms', 'POST', input],
    ['/api/voice/rooms/test-room/join', 'POST', { invite: 'test-only-invite' }],
    ['/api/voice/rooms/test-room/leave', 'POST', {}],
    ['/api/voice/rooms/test-room', 'PATCH', { chatEnabled: false }],
  ]);
});

test('a timed-out write is surfaced once without creating a second room or message', async () => {
  for (const operation of ['create', 'send'] as const) {
    let attempts = 0;
    const failure = new Error('connection lost after request may have committed');
    const request: ApiRequest = async () => { attempts++; throw failure; };
    const api = createRoomsApi(request);
    const event: VoiceEvent = {
      type: 'message', text: 'رسالة اختبار', requestId: 'test-only-stable-request',
    };
    await assert.rejects(
      operation === 'create' ? api.create(createRoomDefaults('اختبار')) : api.send('room', event),
      (error) => error === failure,
    );
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(attempts, 1);
  }
});

test('message and reaction commands preserve request IDs for server idempotency', async () => {
  const commands: unknown[] = [];
  const request: ApiRequest = async (_path, options) => {
    commands.push(options?.body);
    return snapshot() as never;
  };
  const api = createRoomsApi(request);
  const message: VoiceEvent = { type: 'message', text: 'اختبار', requestId: 'message-test-id' };
  const reaction: VoiceEvent = {
    type: 'reaction', messageId: 'server-message', emoji: '👏', requestId: 'reaction-test-id',
  };
  await api.send('room', message);
  await api.send('room', reaction);
  assert.deepEqual(commands, [message, reaction]);
});

test('stale snapshots never roll current membership or moderator permissions backwards', () => {
  const current = snapshot({ cursor: 12, me: participant({ role: 'listener', seatIndex: null }) });
  const stale = snapshot({ cursor: 11, me: participant({ role: 'host' }) });
  assert.equal(nextSnapshot(current, stale), current);
  assert.equal(canManageRoom(nextSnapshot(current, stale)), false);
});

test('late responses from a different room cannot replace the active room', () => {
  const current = snapshot();
  const oldRoom = snapshot({ room: { ...current.room, id: 'previous-room' }, cursor: 999 });
  assert.equal(nextSnapshot(current, oldRoom), current);
  assert.equal(nextSnapshot(null, oldRoom), oldRoom);
});

test('same-cursor server snapshots may refresh messages and current user state', () => {
  const current = snapshot();
  const refreshed = snapshot({ me: participant({ role: 'listener', seatIndex: null }) });
  assert.equal(nextSnapshot(current, refreshed), refreshed);
});

test('moderation controls require host role or the server moderator-management setting', () => {
  const room = snapshot();
  assert.equal(canManageRoom(room), true);
  const moderator = participant({ role: 'moderator' });
  assert.equal(canManageRoom({ ...room, me: moderator }), true);
  assert.equal(canManageRoom({
    ...room, me: moderator, room: { ...room.room, moderatorsCanManage: false },
  }), false);
  assert.equal(canManageRoom({ ...room, me: participant({ role: 'speaker' }) }), false);
  assert.equal(canManageRoom({ ...room, me: null }), false);
});

test('seat selection skips locked and occupied seats and rejects unavailable preferences', () => {
  const room = snapshot();
  room.room.seatCount = 4;
  room.room.lockedSeats = [1];
  assert.equal(availableSeat(room), 2);
  assert.equal(availableSeat(room, 3), 3);
  for (const preferred of [-1, 0, 0.5, 1, 4, Number.NaN]) assert.equal(availableSeat(room, preferred), 2);
  room.room.lockedSeats = [1, 2, 3];
  assert.equal(availableSeat(room), undefined);
});

test('microphone controls never grant capture to a listener, removed member, or moderator-muted speaker', () => {
  const room = snapshot();
  assert.equal(canUseMicrophone(room.room, room.me), true);
  assert.equal(canUseMicrophone({ active: false }, room.me), false);
  assert.equal(canUseMicrophone(room.room, null), false);
  assert.equal(canUseMicrophone(room.room, participant({ seatIndex: null })), false);
  assert.equal(canUseMicrophone(room.room, participant({ role: 'listener' })), false);
  assert.equal(canUseMicrophone(room.room, participant({ moderatorMuted: true })), false);
});

test('membership denial terminates the room flow while transient service failure remains distinguishable', () => {
  for (const status of [401, 403, 404, 410]) assert.equal(isMembershipFailure({ status }), true);
  for (const status of [408, 429, 500, 503]) assert.equal(isMembershipFailure({ status }), false);
  assert.equal(isMembershipFailure(new Error('offline')), false);
  assert.equal(isMembershipFailure(null), false);
});

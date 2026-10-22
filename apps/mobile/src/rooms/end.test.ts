import assert from 'node:assert/strict';
import test from 'node:test';
import type { VoiceParticipant, VoiceSnapshot } from '../api/contracts';
import { createRoomsApi, type ApiRequest } from './api';
import { canEndRoom, endRoom } from './end';
import { createRoomDefaults } from './state';

// Injected HTTP contract tests; these do not exercise a production account or SFU.
function snapshot(): VoiceSnapshot {
  const me: VoiceParticipant = {
    id: 'fixture-host', name: 'مضيف اختبار محلي', image: null, role: 'host',
    seatIndex: 0, handRaised: false, requestedSeat: null, muted: true,
    moderatorMuted: false, joinedAt: 1, lastSeenAt: 1,
  };
  return {
    room: {
      ...createRoomDefaults('غرفة اختبار'), id: 'fixture/room', hostId: me.id,
      hostName: me.name, hostImage: null, createdAt: 1, active: true,
      lockedSeats: [], participantCount: 1, listenerCount: 0,
      speakers: [me], passwordRequired: false,
    },
    me, participants: [me], messages: [], cursor: 7,
  };
}
function closed(current = snapshot()): VoiceSnapshot {
  return {
    ...current, room: { ...current.room, active: false, participantCount: 0,
      listenerCount: 0, speakers: [] }, me: null, participants: [], cursor: current.cursor + 1,
  };
}

test('end permission follows current server host role, never moderator-management permission', () => {
  const current = snapshot();
  assert.equal(canEndRoom(current), true);
  // The server authorizes the role, not an extra client-only owner-id rule.
  assert.equal(canEndRoom({ ...current, room: { ...current.room, hostId: 'other-owner' } }), true);
  for (const role of ['moderator', 'speaker', 'listener'] as const) {
    assert.equal(canEndRoom({ ...current, me: { ...current.me!, role } }), false);
  }
  assert.equal(canEndRoom({ ...current, me: null }), false);
  assert.equal(canEndRoom(closed(current)), false);
  assert.equal(canEndRoom(null), false);
});

test('end sends the real close event once while membership still exists, without leave or heartbeat', async () => {
  const current = snapshot();
  const expected = closed(current);
  const calls: { path: string; options: Parameters<ApiRequest>[1] }[] = [];
  const request: ApiRequest = async (path, options) => {
    calls.push({ path, options });
    assert.equal(current.me?.role, 'host');
    return expected as never;
  };
  assert.equal(await endRoom(createRoomsApi(request), current), expected);
  assert.deepEqual(calls, [{
    path: '/api/voice/rooms/fixture%2Froom/events',
    options: { method: 'POST', body: { type: 'close' }, timeoutMs: 45_000 },
  }]);
  assert.equal(current.room.active, true);
  assert.equal(current.participants.length, 1);
});

test('lost close response is confirmed with one non-heartbeat GET and never another POST', async () => {
  const current = snapshot();
  const expected = closed(current);
  const failure = new Error('write response lost');
  const calls: { path: string; method: string | undefined }[] = [];
  const request: ApiRequest = async (path, options) => {
    calls.push({ path, method: options?.method });
    if (options?.method === 'POST') throw failure;
    return expected as never;
  };
  assert.equal(await endRoom(createRoomsApi(request), current), expected);
  assert.deepEqual(calls, [
    { path: '/api/voice/rooms/fixture%2Froom/events', method: 'POST' },
    { path: '/api/voice/rooms/fixture%2Froom', method: undefined },
  ]);
});

test('explicit retry after an already committed close resolves the server ROOM_CLOSED response by reading', async () => {
  const current = snapshot();
  const expected = closed(current);
  const request: ApiRequest = async (_path, options) => {
    if (options?.method === 'POST') throw Object.assign(new Error('closed'), { status: 410, code: 'ROOM_CLOSED' });
    return expected as never;
  };
  assert.equal(await endRoom(createRoomsApi(request), current), expected);
});

test('an uncertain close preserves the original active membership for an explicit retry', async () => {
  for (const failRead of [false, true]) {
    const current = snapshot();
    const original = structuredClone(current);
    const failure = new Error('temporary service failure');
    let writes = 0;
    let reads = 0;
    const request: ApiRequest = async (_path, options) => {
      if (options?.method === 'POST') { writes++; throw failure; }
      reads++;
      if (failRead) throw new Error('read unavailable');
      return current as never;
    };
    await assert.rejects(endRoom(createRoomsApi(request), current), (error) => error === failure);
    assert.equal(writes, 1);
    assert.equal(reads, 1);
    assert.deepEqual(current, original);
  }
});

test('confirmation must belong to the same room, retain a monotonic cursor, and contain no members', async () => {
  const current = snapshot();
  const ended = closed(current);
  for (const invalid of [
    { ...ended, room: { ...ended.room, id: 'other-room' } },
    { ...ended, cursor: current.cursor - 1 },
    { ...ended, me: current.me },
    { ...ended, participants: current.participants },
    current,
  ]) {
    let writes = 0;
    let reads = 0;
    const request: ApiRequest = async (_path, options) => {
      if (options?.method === 'POST') writes++; else reads++;
      return invalid as never;
    };
    await assert.rejects(endRoom(createRoomsApi(request), current));
    assert.equal(writes, 1);
    assert.equal(reads, 1);
    assert.equal(current.room.active, true);
  }
});

test('a replaced membership cannot start a close or issue a fallback read through another session', async () => {
  const current = snapshot();
  let valid = false;
  let requests = 0;
  const request: ApiRequest = async () => {
    requests++;
    valid = false;
    throw new Error('old session ended');
  };
  const api = createRoomsApi(request);
  await assert.rejects(endRoom(api, current, () => valid));
  assert.equal(requests, 0);
  valid = true;
  await assert.rejects(endRoom(api, current, () => valid));
  assert.equal(requests, 1);
});

test('non-host callers cannot post close and a committed close remains valid during SFU reconciliation', async () => {
  const current = snapshot();
  let requests = 0;
  const expected = { ...closed(current), mediaSyncPending: true };
  const request: ApiRequest = async () => { requests++; return expected as never; };
  const api = createRoomsApi(request);
  await assert.rejects(endRoom(api, { ...current, me: { ...current.me!, role: 'moderator' } }));
  assert.equal(requests, 0);
  assert.equal(await endRoom(api, current), expected);
  assert.equal(requests, 1);
});

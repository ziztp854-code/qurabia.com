import assert from 'node:assert/strict';
import test from 'node:test';
import type { VoiceRole, VoiceSnapshot } from '../api/contracts';
import { captureRoomExitTarget, executeRoomExit, type RoomExitPorts } from './room-exit';

function snapshot(role: VoiceRole = 'host', active = true): VoiceSnapshot {
  const me = {
    id: 'member', name: 'عضو تجريبي', image: null, role, seatIndex: 0, handRaised: false,
    requestedSeat: null, muted: true, moderatorMuted: false, joinedAt: 1, lastSeenAt: 1,
  };
  return {
    room: {
      id: 'room-a', hostId: 'member', hostName: me.name, hostImage: null, createdAt: 1,
      active, lockedSeats: [], participantCount: 1, listenerCount: 0, speakers: [me],
      passwordRequired: false, name: 'مجلس تجريبي', description: '', category: 'مجالس',
      cover: '/voice/covers/friends.webp', seatCount: 8, isPrivate: false,
      allowMicRequests: true, chatEnabled: true, moderatorsCanManage: true,
    },
    participants: [me], messages: [], me, cursor: 1,
  };
}
function harness(role: VoiceRole = 'host') {
  const current = { generation: 7, roomId: 'room-a' as string | null };
  const events: string[] = [];
  const ports: RoomExitPorts = {
    sessionGeneration: () => current.generation,
    currentRoomId: () => current.roomId,
    stopAudio: async () => { events.push('stop'); },
    end: async () => { events.push('end'); current.roomId = null; },
    leave: async () => { events.push('leave'); current.roomId = null; },
    signOut: async () => { events.push('signOut'); current.generation += 1; },
  };
  return { current, events, ports, target: captureRoomExitTarget(snapshot(role), current.generation) };
}

test('only an active current host is captured for ending; management rights do not grant host logout policy', () => {
  assert.equal(captureRoomExitTarget(snapshot(), 7).host, true);
  for (const role of ['moderator', 'speaker', 'listener'] as const)
    assert.equal(captureRoomExitTarget(snapshot(role), 7).host, false);
  assert.equal(captureRoomExitTarget(snapshot('host', false), 7).host, false);
  assert.deepEqual(captureRoomExitTarget(null, 7), { generation: 7, roomId: null, host: false });
});

test('host logout stops local audio then confirms end before revoking the account; never leaves first', async () => {
  const h = harness();
  assert.equal((await executeRoomExit(h.target, 'logout', h.ports)).status, 'complete');
  assert.deepEqual(h.events, ['stop', 'end', 'signOut']);
});

test('guest and moderator logout leave only their membership without ending another host broadcast', async () => {
  for (const role of ['moderator', 'speaker', 'listener'] as const) {
    const h = harness(role);
    assert.equal((await executeRoomExit(h.target, 'logout', h.ports)).status, 'complete');
    assert.deepEqual(h.events, ['stop', 'leave', 'signOut']);
  }
});

test('manual host end closes for everyone while retaining authentication', async () => {
  const h = harness();
  assert.equal((await executeRoomExit(h.target, 'end', h.ports)).status, 'complete');
  assert.deepEqual(h.events, ['stop', 'end']);
  assert.equal(h.current.generation, 7);
});

test('explicit host leave without ending remains a membership-only operation', async () => {
  const h = harness();
  assert.equal((await executeRoomExit(h.target, 'leave', h.ports)).status, 'complete');
  assert.deepEqual(h.events, ['stop', 'leave']);
});

test('an unconfirmed host close preserves membership and authentication for stay or retry', async () => {
  for (const mode of ['end', 'logout'] as const) {
    const h = harness();
    h.ports.end = async () => { h.events.push('end'); throw new Error('test-only-offline'); };
    const result = await executeRoomExit(h.target, mode, h.ports);
    assert.equal(result.status, 'close-failed');
    assert.deepEqual(h.events, ['stop', 'end']);
    assert.equal(h.current.roomId, 'room-a');
    assert.equal(h.current.generation, 7);
  }
});

test('only explicit local logout permits leaving and revoking without confirmed broadcast end', async () => {
  const h = harness();
  const result = await executeRoomExit(h.target, 'local-logout', h.ports);
  assert.equal(result.status, 'complete');
  assert.deepEqual(h.events, ['stop', 'leave', 'signOut']);
  assert.match(result.warnings.join(' '), /قد يبقى مفتوحًا/);
});

test('SDK cleanup failure does not prevent server close or account revocation', async () => {
  const h = harness();
  h.ports.stopAudio = async () => { h.events.push('stop'); throw new Error('test-only-sdk'); };
  const result = await executeRoomExit(h.target, 'logout', h.ports);
  assert.equal(result.status, 'complete');
  assert.deepEqual(h.events, ['stop', 'end', 'signOut']);
  assert.equal(result.warnings.length, 1);
});

test('a replacement login during local audio cleanup prevents all subsequent membership or logout writes', async () => {
  const h = harness();
  h.ports.stopAudio = async () => { h.events.push('stop'); h.current.generation += 1; };
  assert.equal((await executeRoomExit(h.target, 'logout', h.ports)).status, 'stale');
  assert.deepEqual(h.events, ['stop']);
});

test('a replacement session or room during close prevents revoking or leaving its account', async () => {
  for (const change of ['session', 'room'] as const) {
    const h = harness();
    h.ports.end = async () => {
      h.events.push('end');
      if (change === 'session') h.current.generation += 1;
      else h.current.roomId = 'replacement-room';
    };
    assert.equal((await executeRoomExit(h.target, 'logout', h.ports)).status, 'stale');
    assert.deepEqual(h.events, ['stop', 'end']);
  }
});

test('a stale failure from closing cannot authorize fallback against a replacement membership', async () => {
  const h = harness();
  h.ports.end = async () => {
    h.events.push('end'); h.current.roomId = 'replacement-room'; throw new Error('late failure');
  };
  assert.equal((await executeRoomExit(h.target, 'logout', h.ports)).status, 'stale');
  assert.deepEqual(h.events, ['stop', 'end']);
});

test('an ordinary leave failure still permits logout from this device and reports the uncertainty', async () => {
  const h = harness('listener');
  h.ports.leave = async () => { h.events.push('leave'); throw new Error('test-only-offline'); };
  const result = await executeRoomExit(h.target, 'logout', h.ports);
  assert.equal(result.status, 'complete');
  assert.deepEqual(h.events, ['stop', 'leave', 'signOut']);
  assert.equal(result.warnings.length, 1);
});

test('nonhost manual end is rejected before audio cleanup or writes', async () => {
  const h = harness('moderator');
  assert.equal((await executeRoomExit(h.target, 'end', h.ports)).status, 'not-host');
  assert.deepEqual(h.events, []);
});

test('lost host membership is not silently treated as an authoritative closed broadcast', async () => {
  const h = harness();
  h.current.roomId = null;
  assert.equal((await executeRoomExit(h.target, 'logout', h.ports)).status, 'close-failed');
  assert.deepEqual(h.events, ['stop']);
});

test('no-room logout remains available and does not create a close or membership write', async () => {
  const h = harness();
  h.current.roomId = null;
  const target = captureRoomExitTarget(null, h.current.generation);
  assert.equal((await executeRoomExit(target, 'logout', h.ports)).status, 'complete');
  assert.deepEqual(h.events, ['stop', 'signOut']);
});

test('an already replaced account or room causes no cleanup or writes', async () => {
  for (const change of ['session', 'room'] as const) {
    const h = harness();
    if (change === 'session') h.current.generation += 1;
    else h.current.roomId = 'replacement-room';
    assert.equal((await executeRoomExit(h.target, 'logout', h.ports)).status, 'stale');
    assert.deepEqual(h.events, []);
  }
});

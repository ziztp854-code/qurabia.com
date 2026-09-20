import assert from 'node:assert/strict';
import test from 'node:test';
import { createMobileApi } from './mobile-api';

test('room creation sends the bearer token and accepts a complete live ticket', async () => {
  const fetchImpl: typeof fetch = async (_input, init) => {
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer mobile-access');
    return Response.json({
      ok: true,
      data: {
        room: {
          sessionId: 's1',
          roomCode: 'ABC234',
          status: 'WAITING',
          title: 'مسابقة',
          maxPlayers: 10,
          participants: [],
        },
        ticket: {
          sessionId: 's1',
          subjectId: 'u1',
          role: 'host',
          accessToken: 'live-token',
          expiresAt: 1_800_000_000_000,
          subjectVersion: 2,
        },
      },
    });
  };
  const result = await createMobileApi('https://qurabia.com', fetchImpl).createRoom(
    'mobile-access',
    'quiz-1',
  );
  assert.deepEqual(result.ticket, {
    sessionId: 's1',
    subjectId: 'u1',
    role: 'host',
    accessToken: 'live-token',
    expiresAt: 1_800_000_000_000,
    subjectVersion: 2,
  });
});

test('room creation rejects an incomplete live ticket from the network boundary', async () => {
  const fetchImpl: typeof fetch = async () =>
    Response.json({
      ok: true,
      data: {
        room: {
          sessionId: 's1',
          roomCode: 'ABC234',
          status: 'WAITING',
          title: 'مسابقة',
          maxPlayers: 10,
          participants: [],
        },
        ticket: { sessionId: 's1', subjectId: 'u1', role: 'host' },
      },
    });
  await assert.rejects(
    createMobileApi('https://qurabia.com', fetchImpl).createRoom('mobile-access', 'quiz-1'),
    { name: 'MobileApiError', code: 'INVALID_RESPONSE' },
  );
});

test('guest room join omits authorization and accepts a player ticket', async () => {
  const fetchImpl: typeof fetch = async (_input, init) => {
    assert.equal(new Headers(init?.headers).has('authorization'), false);
    assert.deepEqual(JSON.parse(String(init?.body)), { displayName: 'مها' });
    return Response.json({
      ok: true,
      data: {
        room: {
          sessionId: 's1',
          roomCode: 'ABC234',
          status: 'WAITING',
          title: 'مسابقة',
          maxPlayers: 10,
          participants: [],
        },
        ticket: {
          sessionId: 's1',
          subjectId: 'participant-1',
          role: 'player',
          accessToken: 'live-token',
          expiresAt: 1_800_000_000_000,
        },
      },
    });
  };
  const result = await createMobileApi('https://qurabia.com', fetchImpl).joinRoom('ABC234', 'مها');
  assert.equal(result.ticket.subjectId, 'participant-1');
  assert.equal(result.ticket.role, 'player');
});

test('profile parsing keeps the canonical server rank and aggregate values', async () => {
  const fetchImpl: typeof fetch = async (_input, init) => {
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer mobile-access');
    return Response.json({
      ok: true,
      data: {
        id: 'user-1',
        displayName: 'مها',
        email: 'maha@example.com',
        avatarUrl: null,
        bio: null,
        rank: { code: 'KNIGHT', name: 'الفارس', tagline: 'منافس دائم', emblem: '⚜' },
        stats: { quizzes: 2, questions: 12, participations: 4, hostedRooms: 1 },
      },
    });
  };
  const profile = await createMobileApi('https://qurabia.com', fetchImpl).getProfile(
    'mobile-access',
  );
  assert.equal(profile.rank.code, 'KNIGHT');
  assert.deepEqual(profile.stats, {
    quizzes: 2,
    questions: 12,
    participations: 4,
    hostedRooms: 1,
  });
});

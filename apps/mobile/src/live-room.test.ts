import assert from 'node:assert/strict';
import test from 'node:test';
import type { QuestionPayload } from '@tahaddi/contracts';
import {
  arabicNumber,
  estimateClockOffset,
  parseJoinResponse,
  parseRoomResponse,
  pollIntervalFor,
  questionCountdown,
  roomEndpoint,
  roomRequestBody,
} from './live-room';

const identity = {
  sessionId: 'session-1',
  participantId: 'player-1',
  participantToken: 'signed-token',
  roomCode: 'H7UZT3',
  displayName: 'نورة',
};

const snapshot = {
  sessionId: 'session-1',
  roomCode: 'H7UZT3',
  phase: 'LOBBY',
  serverTime: 1_000,
  question: null,
  reveal: null,
  leaderboard: [],
  participantCount: 1,
  playerAnswer: null,
  playerResult: null,
};

test('accepts a complete join response as a player identity', () => {
  assert.deepEqual(parseJoinResponse(200, { ok: true, ...identity }), { ok: true, identity });
});

test('surfaces the server message when joining fails', () => {
  assert.deepEqual(
    parseJoinResponse(409, { ok: false, error: 'ROOM_FULL', message: 'اكتمل العدد.' }),
    { ok: false, fatal: false, message: 'اكتمل العدد.' },
  );
  assert.equal(parseJoinResponse(200, { ok: true, sessionId: 'session-1' }).ok, false);
});

test('builds authenticated room requests for the player role', () => {
  assert.equal(roomEndpoint('session/1'), 'https://qurabia.com/api/live/session%2F1/room');
  assert.deepEqual(roomRequestBody(identity, 'answer', { questionId: 'q1', optionId: 'o2' }), {
    operation: 'answer',
    role: 'player',
    subjectId: 'player-1',
    accessToken: 'signed-token',
    questionId: 'q1',
    optionId: 'o2',
  });
});

test('parses a room snapshot and treats missing sessions as fatal', () => {
  const parsed = parseRoomResponse(200, { ok: true, snapshot, stats: null });
  assert.equal(parsed.ok && parsed.state.snapshot.phase, 'LOBBY');
  assert.deepEqual(parseRoomResponse(401, { ok: false, error: 'UNAUTHORIZED' }), {
    ok: false,
    fatal: true,
    message: 'انتهت هذه الجلسة أو لم تعد متاحة.',
  });
  assert.equal(parseRoomResponse(200, { ok: true, snapshot: { phase: 'PAUSED' } }).ok, false);
});

test('explains answer rejections in Arabic', () => {
  const parsed = parseRoomResponse(409, { ok: false, reason: 'ANSWER_TOO_LATE' });
  assert.deepEqual(parsed, { ok: false, fatal: false, message: 'وصلت الإجابة بعد انتهاء الوقت.' });
});

test('estimates the server clock offset from the request round trip', () => {
  assert.equal(estimateClockOffset(10_500, 1_000, 1_200), 9_400);
});

test('counts down against the server clock and clamps at zero', () => {
  const question = { questionStartedAt: 10_000, questionEndsAt: 30_000 } as QuestionPayload;
  assert.deepEqual(questionCountdown(question, 14_000, 1_000), {
    secondsLeft: 15,
    fractionLeft: 0.75,
    notStarted: false,
  });
  assert.equal(questionCountdown(question, 40_000, 0).secondsLeft, 0);
  assert.equal(questionCountdown(question, 9_000, 0).notStarted, true);
});

test('polls faster during questions and stops when the game ends', () => {
  assert.equal(pollIntervalFor('QUESTION'), 1_000);
  assert.equal(pollIntervalFor('LOBBY'), 2_500);
  assert.equal(pollIntervalFor('FINISHED'), null);
});

test('formats numbers with Arabic-Indic digits', () => {
  assert.equal(arabicNumber(1250), '١٢٥٠');
});

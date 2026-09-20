import assert from 'node:assert/strict';
import test from 'node:test';
import type { GameSnapshot } from '@tahaddi/contracts/client';
import { createInitialLiveGameState, liveGameReducer } from './live-game-state';

function snapshot(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
  return {
    sessionId: 'session-1',
    roomCode: 'ABC123',
    phase: 'LOBBY',
    serverTime: 1_000,
    question: null,
    reveal: null,
    leaderboard: [],
    participantCount: 1,
    playerAnswer: null,
    playerResult: null,
    ...overrides,
  };
}

test('a reconnect snapshot replaces stale transient game state', () => {
  const initial = createInitialLiveGameState();
  const stale = liveGameReducer(initial, {
    type: 'snapshot',
    snapshot: snapshot({ phase: 'QUESTION', participantCount: 4 }),
  });
  const reconnecting = liveGameReducer(stale, { type: 'reconnecting' });
  const restored = liveGameReducer(reconnecting, {
    type: 'snapshot',
    snapshot: snapshot({ phase: 'REVEAL', participantCount: 3 }),
  });

  assert.equal(restored.connection, 'connected');
  assert.equal(restored.snapshot?.phase, 'REVEAL');
  assert.equal(restored.snapshot?.participantCount, 3);
  assert.equal(restored.error, null);
});

test('server join and leave events update presence without mutating the previous snapshot', () => {
  const initial = liveGameReducer(createInitialLiveGameState(), {
    type: 'snapshot',
    snapshot: snapshot(),
  });
  const joined = liveGameReducer(initial, {
    type: 'playerJoined',
    payload: {
      player: { id: 'player-2', name: 'نورة', score: 0, streak: 0, rank: 2 },
      participantCount: 2,
    },
  });
  const left = liveGameReducer(joined, {
    type: 'playerLeft',
    payload: { playerId: 'player-2', participantCount: 1 },
  });

  assert.equal(initial.snapshot?.participantCount, 1);
  assert.equal(joined.snapshot?.participantCount, 2);
  assert.deepEqual(
    joined.players.map((player) => player.id),
    ['player-2'],
  );
  assert.equal(left.snapshot?.participantCount, 1);
  assert.deepEqual(left.players, []);
});

test('answer acknowledgement and final results reflect only server events', () => {
  const active = liveGameReducer(createInitialLiveGameState(), {
    type: 'snapshot',
    snapshot: snapshot({
      phase: 'QUESTION',
      question: {
        questionId: 'question-1',
        prompt: 'ما العاصمة؟',
        options: [{ id: 'riyadh', text: 'الرياض', position: 0 }],
        media: [],
        questionStartedAt: 1_000,
        questionEndsAt: 21_000,
        questionNumber: 1,
        totalQuestions: 1,
      },
    }),
  });
  const submitted = liveGameReducer(active, {
    type: 'answerSubmitted',
    payload: { questionId: 'question-1', optionId: 'riyadh' },
  });
  const accepted = liveGameReducer(submitted, {
    type: 'answerAccepted',
    payload: { questionId: 'question-1', receivedAt: 2_000 },
  });
  const finished = liveGameReducer(accepted, {
    type: 'finished',
    payload: {
      sessionId: 'session-1',
      leaderboard: [{ id: 'player-1', name: 'سارة', score: 900, streak: 1, rank: 1 }],
    },
  });

  assert.deepEqual(accepted.snapshot?.playerAnswer, {
    optionId: 'riyadh',
    receivedAt: 2_000,
  });
  assert.equal(finished.snapshot?.phase, 'FINISHED');
  assert.equal(finished.snapshot?.leaderboard[0]?.score, 900);
});

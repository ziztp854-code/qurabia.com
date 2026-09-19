import { describe, expect, it } from 'vitest';
import {
  buildEliminationRoomSnapshot,
  difficultyForRound,
  resolveEliminationRound,
  type EliminationPlayer,
  type EliminationRoom,
} from './elimination';

function player(
  id: string,
  overrides: Partial<EliminationPlayer> = {},
): EliminationPlayer {
  return {
    id,
    name: `لاعب-${id}`,
    alive: true,
    eliminatedAtRound: null,
    answer: null,
    joinedAt: 0,
    ...overrides,
  };
}

describe('resolveEliminationRound', () => {
  it('يُبقي الصحيح ويُقصي الخطأ وغير المجيب', () => {
    const players = [
      player('a', { answer: { optionIndex: 1, answeredAt: 10 } }),
      player('b', { answer: { optionIndex: 2, answeredAt: 20 } }),
      player('c'),
    ];
    const outcome = resolveEliminationRound(players, 1);
    expect(outcome.survivorIds).toEqual(['a']);
    expect(outcome.eliminatedIds.sort()).toEqual(['b', 'c']);
    expect(outcome.everyoneCorrect).toBe(false);
  });

  it('نجاة جماعية عندما يصيب الجميع', () => {
    const players = [
      player('a', { answer: { optionIndex: 0, answeredAt: 5 } }),
      player('b', { answer: { optionIndex: 0, answeredAt: 9 } }),
    ];
    const outcome = resolveEliminationRound(players, 0);
    expect(outcome.survivorIds).toEqual(['a', 'b']);
    expect(outcome.eliminatedIds).toEqual([]);
    expect(outcome.everyoneCorrect).toBe(true);
  });

  it('ينصف السرب بأسرع الإجابات حين لا يصيب أحد', () => {
    const players = [
      player('a', { answer: { optionIndex: 3, answeredAt: 30 } }),
      player('b', { answer: { optionIndex: 2, answeredAt: 10 } }),
      player('c', { answer: { optionIndex: 1, answeredAt: 40 } }),
      player('d'),
    ];
    const outcome = resolveEliminationRound(players, 0);
    // أسرع إجابتين: b ثم a — الأبطأ (c) ومن لم يجب (d) يخرجان.
    expect(outcome.survivorIds.sort()).toEqual(['a', 'b']);
    expect(outcome.eliminatedIds.sort()).toEqual(['c', 'd']);
  });

  it('ينجو لاعب واحد على الأقل', () => {
    const players = [player('a', { answer: { optionIndex: 3, answeredAt: 30 } })];
    const outcome = resolveEliminationRound(players, 0);
    expect(outcome.survivorIds).toEqual(['a']);
    expect(outcome.eliminatedIds).toEqual([]);
  });
});

describe('difficultyForRound', () => {
  it('يتصاعد من السهل إلى الصعب', () => {
    expect(difficultyForRound(1, 5)).toBe('EASY');
    expect(difficultyForRound(3, 5)).toBe('MEDIUM');
    expect(difficultyForRound(5, 5)).toBe('HARD');
  });
});

describe('buildEliminationRoomSnapshot', () => {
  it('يخفي الإجابة الصحيحة أثناء الجولة ويكشفها بعد الحسم', () => {
    const baseRoom: EliminationRoom = {
      roomCode: 'ABC234',
      hostId: 'host',
      status: 'active',
      totalRounds: 5,
      currentRound: 1,
      roundTimeLimit: 20,
      questionOrder: ['q1'],
      usedQuestionIds: ['q1'],
      currentQuestion: {
        id: 'q1',
        prompt: 'سؤال؟',
        options: ['أ', 'ب', 'ج', 'د'],
        difficulty: 'EASY',
        correctIndex: 2,
      },
      questionOpenedAt: 0,
      questionDeadlineAt: 20_000,
      players: [
        player('p1', { answer: { optionIndex: 0, answeredAt: 100 } }),
        player('p2'),
      ],
      lastRoundResult: null,
      createdAt: 0,
      updatedAt: 0,
      scoringPolicyVersion: 1,
    };

    const active = buildEliminationRoomSnapshot(baseRoom, 'p1', false, 5_000);
    expect(JSON.stringify(active)).not.toContain('"correctIndex"');
    expect(active.revealedCorrectIndex).toBeNull();
    expect(active.myAnswer).toBe(0);
    expect(active.remainingSeconds).toBe(15);

    const closed: EliminationRoom = {
      ...baseRoom,
      status: 'between',
      questionDeadlineAt: null,
      lastRoundResult: {
        roundNumber: 1,
        questionId: 'q1',
        prompt: 'سؤال؟',
        options: ['أ', 'ب', 'ج', 'د'],
        correctIndex: 0,
        difficulty: 'EASY',
        survivorIds: ['p1'],
        eliminatedIds: ['p2'],
        everyoneCorrect: false,
      },
    };
    const revealed = buildEliminationRoomSnapshot(closed, 'p1', false, 21_000);
    expect(revealed.revealedCorrectIndex).toBe(0);
    expect(revealed.remainingSeconds).toBeNull();
  });
});

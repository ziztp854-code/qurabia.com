import { calculateQuestionScore, canTransition } from './game-engine.js';

describe('live game engine', () => {
  it('allows only the documented state-machine transitions', () => {
    expect(canTransition('LOBBY', 'QUESTION')).toBe(true);
    expect(canTransition('QUESTION', 'REVEAL')).toBe(true);
    expect(canTransition('REVEAL', 'LEADERBOARD')).toBe(true);
    expect(canTransition('LEADERBOARD', 'QUESTION')).toBe(true);
    expect(canTransition('FINISHED', 'QUESTION')).toBe(false);
    expect(canTransition('QUESTION', 'QUESTION')).toBe(false);
  });

  it('awards more points to a faster correct server-received answer', () => {
    const fast = calculateQuestionScore({
      correct: true,
      basePoints: 1_000,
      questionStartedAt: 1_000,
      questionEndsAt: 11_000,
      receivedAt: 2_000,
    });
    const slow = calculateQuestionScore({
      correct: true,
      basePoints: 1_000,
      questionStartedAt: 1_000,
      questionEndsAt: 11_000,
      receivedAt: 10_000,
    });
    expect(fast).toBeGreaterThan(slow);
    expect(slow).toBeGreaterThan(0);
  });

  it('returns zero for wrong, early, or late answers', () => {
    const base = {
      basePoints: 1_000,
      questionStartedAt: 10_000,
      questionEndsAt: 20_000,
    };
    expect(
      calculateQuestionScore({ ...base, correct: false, receivedAt: 11_000 }),
    ).toBe(0);
    expect(
      calculateQuestionScore({ ...base, correct: true, receivedAt: 8_999 }),
    ).toBe(0);
    expect(
      calculateQuestionScore({ ...base, correct: true, receivedAt: 20_001 }),
    ).toBe(0);
  });

  it('rejects every answer received before the server-authored start time', () => {
    const score = calculateQuestionScore({
      correct: true,
      basePoints: 1_000,
      questionStartedAt: 10_000,
      questionEndsAt: 20_000,
      receivedAt: 9_800,
    });
    expect(score).toBe(0);
  });
});

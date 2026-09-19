import { describe, expect, it } from 'vitest';
import { deriveHttpGamePhase } from './http-phase';

describe('deriveHttpGamePhase', () => {
  const activeQuestion = {
    status: 'ACTIVE' as const,
    questionStartedAt: 1_000,
    questionEndsAt: 21_000,
    questionAdvanceAt: null,
    allAnswered: false,
    now: 10_000,
  };

  it('keeps a waiting room in the lobby', () => {
    expect(
      deriveHttpGamePhase({
        ...activeQuestion,
        status: 'WAITING',
        questionStartedAt: null,
        questionEndsAt: null,
      }),
    ).toBe('LOBBY');
  });

  it('shows an active question before its deadline', () => {
    expect(deriveHttpGamePhase(activeQuestion)).toBe('QUESTION');
  });

  it('reveals the answer after time expires or everyone answers', () => {
    expect(deriveHttpGamePhase({ ...activeQuestion, now: 21_000 })).toBe('REVEAL');
    expect(deriveHttpGamePhase({ ...activeQuestion, allAnswered: true })).toBe('REVEAL');
  });

  it('shows final standings for a finished session', () => {
    expect(deriveHttpGamePhase({ ...activeQuestion, status: 'FINISHED' })).toBe('FINISHED');
  });
});

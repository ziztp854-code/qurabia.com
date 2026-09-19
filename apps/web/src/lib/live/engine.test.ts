import { describe, expect, it } from 'vitest';
import { calculateLiveQuestionProgress, calculateTimedScore } from './engine';

describe('calculateLiveQuestionProgress', () => {
  const questionStartedAt = new Date('2026-07-24T00:00:10.000Z');

  it('keeps saved answers and the participant total consistent after heartbeats become stale', () => {
    expect(
      calculateLiveQuestionProgress({
        participants: [
          { id: 'player-1', joinedAt: new Date('2026-07-24T00:00:00.000Z') },
          { id: 'player-2', joinedAt: new Date('2026-07-24T00:00:01.000Z') },
        ],
        answers: [
          { participantId: 'player-1', questionId: 'question-1' },
          { participantId: 'player-2', questionId: 'question-1' },
        ],
        questionId: 'question-1',
        questionStartedAt,
      }),
    ).toEqual({ answeredCount: 2, participantCount: 2 });
  });

  it('excludes players who joined after the question started', () => {
    expect(
      calculateLiveQuestionProgress({
        participants: [
          { id: 'player-1', joinedAt: new Date('2026-07-24T00:00:00.000Z') },
          { id: 'player-late', joinedAt: new Date('2026-07-24T00:00:11.000Z') },
        ],
        answers: [
          { participantId: 'player-1', questionId: 'question-1' },
          { participantId: 'player-late', questionId: 'question-1' },
        ],
        questionId: 'question-1',
        questionStartedAt,
      }),
    ).toEqual({ answeredCount: 1, participantCount: 1 });
  });
});

describe('calculateTimedScore', () => {
  const startedAt = new Date('2026-07-24T00:00:00.000Z');

  it('يعطي النقاط الكاملة للإجابة الفورية الصحيحة', () => {
    expect(
      calculateTimedScore({
        basePoints: 1000,
        timeLimitSeconds: 20,
        questionStartedAt: startedAt,
        receivedAt: startedAt,
        speedScoring: true,
      }),
    ).toBe(1000);
  });

  it('يحافظ على نصف النقاط على الأقل عند انتهاء الوقت', () => {
    expect(
      calculateTimedScore({
        basePoints: 1000,
        timeLimitSeconds: 20,
        questionStartedAt: startedAt,
        receivedAt: new Date('2026-07-24T00:00:20.000Z'),
        speedScoring: true,
      }),
    ).toBe(500);
  });

  it('يعيد النقاط الأساسية عند تعطيل احتساب السرعة', () => {
    expect(
      calculateTimedScore({
        basePoints: 1000,
        timeLimitSeconds: 20,
        questionStartedAt: startedAt,
        receivedAt: new Date('2026-07-24T00:00:19.000Z'),
        speedScoring: false,
      }),
    ).toBe(1000);
  });
});

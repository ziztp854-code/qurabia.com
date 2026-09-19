import { loadLadderQuestionCandidates } from '../ladder-question-bank.js';
import type { LadderRoomRuntime } from '../ladder.types.js';
import type { DatabaseService } from '../../game/database.service.js';

function room(overrides: Partial<LadderRoomRuntime> = {}): LadderRoomRuntime {
  return {
    roomCode: 'ABCD1234',
    hostId: 'host-1',
    status: 'waiting',
    currentRound: 0,
    totalRounds: 5,
    rightScore: 0,
    leftScore: 0,
    rightPosition: 0,
    leftPosition: 0,
    winningPosition: 5,
    questionTimeLimit: 30,
    currentQuestion: null,
    teams: [],
    createdAt: 1,
    updatedAt: 1,
    usedQuestionIds: [],
    recentCategoryIds: [],
    ...overrides,
  };
}

describe('loadLadderQuestionCandidates', () => {
  it('prefers quiz pack candidates when quizId is set and pool is large enough', async () => {
    const packQuestions = Array.from({ length: 20 }, (_, index) => ({
      id: `pack-${index}`,
      type: 'MULTIPLE_CHOICE' as const,
      prompt: `سؤال ${index}`,
      difficulty: 'EASY' as const,
      timeLimit: 25,
      status: 'PUBLISHED' as const,
      gameTypes: ['LADDER' as const],
      category: { id: `cat-${index % 3}`, name: `فئة ${index % 3}` },
      options: [
        { id: `pack-${index}-a`, text: 'أ', isCorrect: true },
        { id: `pack-${index}-b`, text: 'ب', isCorrect: false },
      ],
    }));

    const findFirst = jest.fn().mockResolvedValue({
      questions: packQuestions.map((question) => ({ question })),
    });
    const findMany = jest.fn();
    const database = {
      client: {
        quiz: { findFirst },
        question: { findMany },
      },
    } as unknown as DatabaseService;

    const candidates = await loadLadderQuestionCandidates(
      database,
      room({ quizId: 'quiz-ladder' }),
    );

    expect(findFirst).toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
    expect(candidates).toHaveLength(20);
    expect(candidates[0]?.id).toBe('pack-0');
  });

  it('falls back to bank tags when no quizId is present', async () => {
    const findFirst = jest.fn();
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'bank-1',
        type: 'TRUE_FALSE',
        prompt: 'سؤال بنك',
        difficulty: 'MEDIUM',
        timeLimit: 20,
        category: { id: 'cat-bank', name: 'عام' },
        options: [
          { id: 'bank-1-a', text: 'صح', isCorrect: true },
          { id: 'bank-1-b', text: 'خطأ', isCorrect: false },
        ],
      },
    ]);
    const database = {
      client: {
        quiz: { findFirst },
        question: { findMany },
      },
    } as unknown as DatabaseService;

    const candidates = await loadLadderQuestionCandidates(database, room());

    expect(findFirst).not.toHaveBeenCalled();
    expect(findMany).toHaveBeenCalled();
    expect(candidates.map((candidate) => candidate.id)).toEqual(['bank-1']);
  });
});

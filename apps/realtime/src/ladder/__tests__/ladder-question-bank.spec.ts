import { loadLadderQuestionCandidates } from '../ladder-question-bank.js';
import type { LadderRoomRuntime } from '../ladder.types.js';
import type { DatabaseService } from '../../infrastructure/database.service.js';

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
  it.each([false, true])(
    'excludes known numbered copies from bank and pack candidates (pack: %s)',
    async (usePack) => {
      const prompt =
        'من هو القائد القرطاجي الشهير الذي قاد جيشه مع الفيلة وعبر جبال الألب لمهاجمة روما؟';
      const row = (id: string, text: string) => ({
        id,
        type: 'MULTIPLE_CHOICE',
        prompt: text,
        difficulty: 'EASY',
        timeLimit: 20,
        status: 'PUBLISHED',
        gameTypes: ['LADDER'],
        category: { id: 'history', name: 'تاريخ' },
        options: [
          { id: `${id}-a`, text: 'حنبعل', isCorrect: true },
          { id: `${id}-b`, text: 'الإسكندر', isCorrect: false },
          { id: `${id}-c`, text: 'قيصر', isCorrect: false },
          { id: `${id}-d`, text: 'نابليون', isCorrect: false },
        ],
      });
      const rows = [
        row('copy-93', `${prompt} (فصل 93)`),
        row('copy-94', `${prompt} (فصل 94)`),
        row('original', prompt),
      ];
      const before = JSON.stringify(rows);
      const findMany = jest.fn().mockResolvedValue(rows);
      const database = {
        client: {
          quiz: {
            findFirst: jest.fn().mockResolvedValue({
              questions: rows.map((question) => ({ question })),
            }),
          },
          question: { findMany },
        },
      } as unknown as DatabaseService;
      const candidates = await loadLadderQuestionCandidates(
        database,
        room({ totalRounds: 1, ...(usePack ? { quizId: 'pack' } : {}) }),
      );
      expect(candidates.map((item) => item.id)).toEqual(['original']);
      expect(candidates[0]?.options[0]).toMatchObject({
        text: 'حنبعل',
        isCorrect: true,
      });
      expect(JSON.stringify(rows)).toBe(before);
      if (usePack) expect(findMany).not.toHaveBeenCalled();
    },
  );

  it('continues past duplicate bank rows to find another valid question', async () => {
    const all = Array.from({ length: 501 }, (_, index) => ({
      id: `q-${index}`,
      type: 'TRUE_FALSE' as const,
      prompt: index === 500 ? 'هل الأرض تدور حول الشمس؟' : 'هل الماء سائل؟',
      difficulty: 'EASY' as const,
      timeLimit: 20,
      category: { id: 'science', name: 'علوم' },
      options: [
        { id: `${index}-yes`, text: 'نعم', isCorrect: true },
        { id: `${index}-no`, text: 'لا', isCorrect: false },
      ],
    }));
    const findMany = jest.fn(
      ({ skip = 0, take }: { skip?: number; take: number }) =>
        Promise.resolve(all.slice(skip, skip + take)),
    );
    const database = {
      client: { quiz: { findFirst: jest.fn() }, question: { findMany } },
    } as unknown as DatabaseService;
    const candidates = await loadLadderQuestionCandidates(database, room());
    expect(candidates.map((item) => item.prompt)).toContain(
      'هل الأرض تدور حول الشمس؟',
    );
    expect(
      candidates.filter((item) => item.prompt === 'هل الماء سائل؟'),
    ).toHaveLength(1);
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('samples across a large unique page instead of always taking its first questions', async () => {
    const all = Array.from({ length: 500 }, (_, index) => ({
      id: `q-${index}`,
      type: 'TRUE_FALSE' as const,
      prompt: `هل السؤال رقم ${index} صحيح؟`,
      difficulty: 'EASY' as const,
      timeLimit: 20,
      category: { id: 'science', name: 'علوم' },
      options: [
        { id: `${index}-yes`, text: 'نعم', isCorrect: true },
        { id: `${index}-no`, text: 'لا', isCorrect: false },
      ],
    }));
    const findMany = jest.fn(
      ({ skip = 0, take }: { skip?: number; take: number }) =>
        Promise.resolve(all.slice(skip, skip + take)),
    );
    const database = {
      client: { quiz: { findFirst: jest.fn() }, question: { findMany } },
    } as unknown as DatabaseService;
    const random = jest.spyOn(Math, 'random').mockReturnValue(0.999);
    try {
      const candidates = await loadLadderQuestionCandidates(database, room());
      expect(findMany).toHaveBeenCalledTimes(1);
      expect(candidates).toHaveLength(80);
      expect(candidates.some((item) => Number(item.id.slice(2)) > 80)).toBe(
        true,
      );
    } finally {
      random.mockRestore();
    }
  });

  it('bounds scanning an exhausted bank to eight queries', async () => {
    const duplicate = {
      id: 'same',
      type: 'TRUE_FALSE' as const,
      prompt: 'هل الماء سائل؟',
      difficulty: 'EASY' as const,
      timeLimit: 20,
      category: { id: 'science', name: 'علوم' },
      options: [
        { id: 'y', text: 'نعم', isCorrect: true },
        { id: 'n', text: 'لا', isCorrect: false },
      ],
    };
    const findMany = jest.fn().mockResolvedValue(Array(500).fill(duplicate));
    const database = {
      client: { quiz: { findFirst: jest.fn() }, question: { findMany } },
    } as unknown as DatabaseService;
    const candidates = await loadLadderQuestionCandidates(
      database,
      room({
        usedQuestionFingerprints: ['هل الماء سائل؟'],
      }),
    );
    expect(candidates).toEqual([]);
    expect(findMany).toHaveBeenCalledTimes(8);
  });

  it('supplements a pack containing only copies of the same question', async () => {
    const q = (id: string, prompt: string) => ({
      id,
      type: 'TRUE_FALSE' as const,
      prompt,
      difficulty: 'EASY' as const,
      timeLimit: 20,
      status: 'PUBLISHED' as const,
      gameTypes: ['LADDER' as const],
      category: { id: 'science', name: 'علوم' },
      options: [
        { id: `${id}-y`, text: 'نعم', isCorrect: true },
        { id: `${id}-n`, text: 'لا', isCorrect: false },
      ],
    });
    const pack = Array.from({ length: 20 }, (_, i) => ({
      question: q(`pack-${i}`, 'هل الماء سائل؟'),
    }));
    const findMany = jest
      .fn()
      .mockResolvedValue([q('bank-other', 'هل الأرض كوكب؟')]);
    const database = {
      client: {
        quiz: { findFirst: jest.fn().mockResolvedValue({ questions: pack }) },
        question: { findMany },
      },
    } as unknown as DatabaseService;
    const candidates = await loadLadderQuestionCandidates(
      database,
      room({ quizId: 'pack' }),
    );
    expect(candidates.map((item) => item.id)).toEqual(['pack-0', 'bank-other']);
  });
  it('prefers quiz pack candidates when quizId is set and pool is large enough', async () => {
    const packQuestions = Array.from({ length: 20 }, (_, index) => ({
      id: `pack-${index}`,
      type: 'MULTIPLE_CHOICE' as const,
      prompt: `سؤال ثقافي رقم ${index}`,
      difficulty: 'EASY' as const,
      timeLimit: 25,
      status: 'PUBLISHED' as const,
      gameTypes: ['LADDER' as const],
      category: { id: `cat-${index % 3}`, name: `فئة ${index % 3}` },
      options: [
        { id: `pack-${index}-a`, text: 'الخيار الأول', isCorrect: true },
        { id: `pack-${index}-b`, text: 'الخيار الثاني', isCorrect: false },
        { id: `pack-${index}-c`, text: 'الخيار الثالث', isCorrect: false },
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

  it('keeps the remaining selected pack questions without mixing in bank questions', async () => {
    const questions = Array.from({ length: 10 }, (_, index) => ({
      question: {
        id: `pack-${index}`,
        type: 'MULTIPLE_CHOICE',
        prompt: `سؤال ثقافي مختلف رقم ${index}؟`,
        difficulty: 'HARD',
        timeLimit: 20,
        status: 'PUBLISHED',
        gameTypes: ['LADDER'],
        category: { id: 'category', name: 'ثقافة' },
        options: [
          { id: `${index}-a`, text: 'الأول', isCorrect: true },
          { id: `${index}-b`, text: 'الثاني', isCorrect: false },
          { id: `${index}-c`, text: 'الثالث', isCorrect: false },
        ],
      },
    }));
    const findMany = jest.fn();
    const database = {
      client: {
        quiz: { findFirst: jest.fn().mockResolvedValue({ questions }) },
        question: { findMany },
      },
    } as unknown as DatabaseService;
    const candidates = await loadLadderQuestionCandidates(
      database,
      room({
        quizId: 'pack',
        totalRounds: 10,
        usedQuestionIds: Array.from(
          { length: 9 },
          (_, index) => `pack-${index}`,
        ),
      }),
    );
    expect(candidates.map((candidate) => candidate.id)).toEqual(['pack-9']);
    expect(findMany).not.toHaveBeenCalled();
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

  it('queries the target difficulty before the bounded general pool', async () => {
    const queries: Array<{ where: { difficulty?: string } }> = [];
    const findMany = jest.fn((query: { where: { difficulty?: string } }) => {
      queries.push(query);
      return Promise.resolve([]);
    });
    const database = {
      client: { quiz: { findFirst: jest.fn() }, question: { findMany } },
    } as unknown as DatabaseService;
    await loadLadderQuestionCandidates(database, room(), 'HARD');
    expect(queries).toHaveLength(2);
    expect(queries[0]?.where.difficulty).toBe('HARD');
    expect(queries[1]?.where.difficulty).toBeUndefined();
  });
});

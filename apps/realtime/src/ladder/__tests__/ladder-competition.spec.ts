import { loadCompetitionQuestions } from '../ladder-competition.js';
import { COMPETITION_FIXTURE } from './competition-fixture.js';
import * as privateBank from '../ladder-private-bank.js';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import type { DatabaseService } from '../../infrastructure/database.service.js';

describe('reviewed competition questions', () => {
  const REVIEWED_COMPETITION_QUESTIONS = COMPETITION_FIXTURE.sets[0];
  beforeEach(() =>
    jest
      .spyOn(privateBank, 'readPrivateCompetitionBank')
      .mockReturnValue(COMPETITION_FIXTURE),
  );
  afterEach(() => jest.restoreAllMocks());
  const database = (rows: unknown[]) =>
    ({
      client: { question: { findMany: jest.fn().mockResolvedValue(rows) } },
    }) as unknown as DatabaseService;

  it('prepares ten distinct reviewed questions in the required difficulty distribution', async () => {
    const result = await loadCompetitionQuestions(
      database(REVIEWED_COMPETITION_QUESTIONS),
    );
    expect(result.map((q) => q.difficulty)).toEqual([
      'EASY',
      'EASY',
      'EASY',
      'MEDIUM',
      'MEDIUM',
      'MEDIUM',
      'HARD',
      'HARD',
      'HARD',
      'HARD',
    ]);
    expect(new Set(result.map((q) => q.prompt)).size).toBe(10);
  });

  it('refuses a missing or modified reviewed question rather than substituting from the general bank', async () => {
    await expect(
      loadCompetitionQuestions(
        database(REVIEWED_COMPETITION_QUESTIONS.slice(1)),
      ),
    ).rejects.toThrow();
    const [first, ...rest] = REVIEWED_COMPETITION_QUESTIONS;
    await expect(
      loadCompetitionQuestions(
        database([{ ...first, prompt: 'محتوى تغير بعد المراجعة' }, ...rest]),
      ),
    ).rejects.toThrow();
    await expect(
      loadCompetitionQuestions(
        database([
          {
            ...first,
            options: first.options.map((option) => ({
              ...option,
              isCorrect: !option.isCorrect,
            })),
          },
          ...rest,
        ]),
      ),
    ).rejects.toThrow();
  });

  it('provides eight disjoint ten-question sets, each with the exact requested difficulties', async () => {
    const db = database(REVIEWED_COMPETITION_QUESTIONS);
    const sets = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        loadCompetitionQuestions(db, index),
      ),
    );
    expect(new Set(sets.flat().map((q) => q.prompt)).size).toBe(80);
    for (const set of sets) {
      expect(set.map((q) => q.difficulty)).toEqual([
        'EASY',
        'EASY',
        'EASY',
        'MEDIUM',
        'MEDIUM',
        'MEDIUM',
        'HARD',
        'HARD',
        'HARD',
        'HARD',
      ]);
    }
    await expect(loadCompetitionQuestions(db, 8)).rejects.toThrow();
  });

  it('validates the private bank digest and rejects altered content', () => {
    const bytes = Buffer.from(JSON.stringify(COMPETITION_FIXTURE));
    const digest = createHash('sha256').update(bytes).digest('hex');
    const compressed = gzipSync(bytes).toString('base64');
    expect(
      privateBank.parsePrivateCompetitionBank(compressed, digest).sets,
    ).toHaveLength(8);
    expect(() =>
      privateBank.parsePrivateCompetitionBank(compressed, '0'.repeat(64)),
    ).toThrow();
  });
});

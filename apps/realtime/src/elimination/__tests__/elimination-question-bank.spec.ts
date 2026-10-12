import type { DatabaseService } from '../../game/database.service.js';
import { loadEliminationQuestions } from '../elimination-question-bank.js';

describe('elimination question pack selection', () => {
  const findMany = jest.fn<Promise<unknown[]>, [{ where: unknown }]>();
  const database = {
    client: { question: { findMany } },
  } as unknown as DatabaseService;
  beforeEach(() => {
    findMany.mockReset();
    findMany.mockResolvedValue([]);
  });

  it('scopes a selected pack to an active quiz owned by the authenticated host', async () => {
    await loadEliminationQuestions(database, {
      quizId: 'private-pack',
      ownerId: 'host-1',
    });
    const query = findMany.mock.calls[0]?.[0];
    expect(query?.where).toMatchObject({
      quizzes: {
        some: {
          quizId: 'private-pack',
          quiz: { ownerId: 'host-1', status: 'ACTIVE', gameMode: 'QUIZ' },
        },
      },
    });
  });

  it('excludes private AI packs from default rooms while retaining questions without a source', async () => {
    await loadEliminationQuestions(database);
    const query = findMany.mock.calls[0]?.[0];
    expect(query?.where).toMatchObject({
      OR: [{ source: null }, { source: { not: 'AI_GAME_PRIVATE' } }],
    });
  });

  it('returns no fallback questions for an inaccessible or empty pack', async () => {
    expect(
      await loadEliminationQuestions(database, {
        quizId: 'another-users-pack',
        ownerId: 'host-1',
      }),
    ).toEqual([]);
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});

import { randomInt } from 'node:crypto';
import type { DatabaseService } from '../infrastructure/database.service.js';
import { readPrivateCompetitionBank } from './ladder-private-bank.js';
import type { LadderQuestionCandidate } from './ladder-question-selection.js';

function comparable(q: LadderQuestionCandidate): string {
  return JSON.stringify({
    id: q.id,
    prompt: q.prompt,
    difficulty: q.difficulty,
    type: q.type,
    timeLimit: q.timeLimit,
    category: { id: q.category.id, name: q.category.name },
    options: q.options.map((o) => ({
      id: o.id,
      text: o.text,
      isCorrect: o.isCorrect,
    })),
  });
}

export async function loadCompetitionQuestions(
  database: DatabaseService,
  packIndex = 0,
): Promise<LadderQuestionCandidate[]> {
  const bank = readPrivateCompetitionBank();
  if (
    !Number.isInteger(packIndex) ||
    packIndex < 0 ||
    packIndex >= bank.sets.length
  )
    throw new Error('Competition set unavailable');
  const chosen = bank.sets[packIndex];
  const ids = chosen
    .filter((q) => bank.publishedBankIds.includes(q.id))
    .map((q) => q.id);
  const rows =
    ids.length === 0
      ? []
      : await database.client.question.findMany({
          where: {
            id: { in: ids },
            status: 'PUBLISHED',
            archivedAt: null,
            gameTypes: { has: 'LADDER' },
            category: { is: { isActive: true } },
          },
          select: {
            id: true,
            prompt: true,
            difficulty: true,
            type: true,
            timeLimit: true,
            category: { select: { id: true, name: true } },
            options: {
              orderBy: { position: 'asc' },
              select: { id: true, text: true, isCorrect: true },
            },
          },
        });
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const expected of chosen.filter((q) => ids.includes(q.id))) {
    const row = byId.get(expected.id);
    if (
      !row ||
      !row.category ||
      (row.type !== 'MULTIPLE_CHOICE' && row.type !== 'TRUE_FALSE')
    )
      throw new Error('Reviewed question missing');
    const candidate: LadderQuestionCandidate = {
      ...row,
      category: row.category,
      type: row.type,
    };
    if (comparable(candidate) !== comparable(expected))
      throw new Error('Reviewed question changed');
  }
  return (['EASY', 'MEDIUM', 'HARD'] as const).flatMap((difficulty) => {
    const group = chosen.filter((q) => q.difficulty === difficulty);
    for (let i = group.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [group[i], group[j]] = [group[j], group[i]];
    }
    return group;
  });
}

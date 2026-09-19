import type { LadderRoomRuntime } from './ladder.types.js';
import type { DatabaseService } from '../game/database.service.js';
import type { LadderQuestionCandidate } from './ladder-question-selection.js';

const MAX_CANDIDATE_POOL = 80;
const MIN_CANDIDATE_POOL = 16;

function mapRowsToCandidates(
  rows: Array<{
    id: string;
    type: string;
    prompt: string;
    difficulty: 'EASY' | 'MEDIUM' | 'HARD';
    timeLimit: number;
    category: { id: string; name: string } | null;
    options: Array<{ id: string; text: string; isCorrect: boolean }>;
  }>,
): LadderQuestionCandidate[] {
  return rows.flatMap((row) =>
    row.category &&
    (row.type === 'MULTIPLE_CHOICE' || row.type === 'TRUE_FALSE')
      ? [
          {
            id: row.id,
            type: row.type,
            prompt: row.prompt,
            difficulty: row.difficulty,
            category: row.category,
            timeLimit: row.timeLimit,
            options: row.options,
          },
        ]
      : [],
  );
}

async function loadPackCandidates(
  database: DatabaseService,
  room: LadderRoomRuntime,
): Promise<LadderQuestionCandidate[]> {
  const quizId = room.quizId?.trim();
  if (!quizId) return [];

  const usedQuestionIds = room.usedQuestionIds ?? [];
  const quiz = await database.client.quiz.findFirst({
    where: {
      id: quizId,
      status: { not: 'ARCHIVED' },
      gameMode: 'LADDER',
    },
    select: {
      questions: {
        orderBy: { position: 'asc' },
        select: {
          question: {
            select: {
              id: true,
              type: true,
              prompt: true,
              difficulty: true,
              timeLimit: true,
              status: true,
              gameTypes: true,
              category: { select: { id: true, name: true } },
              options: {
                orderBy: { position: 'asc' },
                select: { id: true, text: true, isCorrect: true },
              },
            },
          },
        },
      },
    },
  });

  if (!quiz) return [];

  const rows = quiz.questions
    .map((item) => item.question)
    .filter(
      (question) =>
        question.status === 'PUBLISHED' &&
        !usedQuestionIds.includes(question.id),
    );

  return mapRowsToCandidates(rows);
}

async function loadBankCandidates(
  database: DatabaseService,
  room: LadderRoomRuntime,
): Promise<LadderQuestionCandidate[]> {
  const usedQuestionIds = room.usedQuestionIds ?? [];
  const rows = await database.client.question.findMany({
    where: {
      status: 'PUBLISHED',
      type: { in: ['MULTIPLE_CHOICE', 'TRUE_FALSE'] },
      category: { is: { isActive: true } },
      gameTypes: { has: 'LADDER' },
      ...(usedQuestionIds.length > 0 ? { id: { notIn: usedQuestionIds } } : {}),
    },
    select: {
      id: true,
      type: true,
      prompt: true,
      difficulty: true,
      timeLimit: true,
      category: { select: { id: true, name: true } },
      options: {
        orderBy: { position: 'asc' },
        select: { id: true, text: true, isCorrect: true },
      },
    },
    orderBy: [{ lastEditedAt: 'desc' }, { id: 'asc' }],
    take: Math.min(
      MAX_CANDIDATE_POOL,
      Math.max(MIN_CANDIDATE_POOL, room.totalRounds * 4),
    ),
  });

  return mapRowsToCandidates(rows);
}

export async function loadLadderQuestionCandidates(
  database: DatabaseService,
  room: LadderRoomRuntime,
): Promise<LadderQuestionCandidate[]> {
  const packCandidates = await loadPackCandidates(database, room);
  const minNeeded = Math.max(MIN_CANDIDATE_POOL, room.totalRounds);
  if (packCandidates.length >= minNeeded) {
    return packCandidates.slice(0, MAX_CANDIDATE_POOL);
  }

  if (packCandidates.length > 0) {
    const bank = await loadBankCandidates(database, room);
    const seen = new Set(packCandidates.map((candidate) => candidate.id));
    const merged = [
      ...packCandidates,
      ...bank.filter((candidate) => !seen.has(candidate.id)),
    ];
    return merged.slice(0, MAX_CANDIDATE_POOL);
  }

  return loadBankCandidates(database, room);
}

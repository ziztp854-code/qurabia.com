import type { LadderRoomRuntime } from './ladder.types.js';
import type { DatabaseService } from '../game/database.service.js';
import {
  isValidLadderQuestionCandidate,
  ladderQuestionFingerprint,
  type LadderDifficulty,
  type LadderQuestionCandidate,
} from './ladder-question-selection.js';

const MAX_CANDIDATE_POOL = 80;
const MIN_CANDIDATE_POOL = 16;
const BANK_PAGE_SIZE = 500;
const MAX_BANK_ROWS_SCANNED = 4000;

// Draw an unbiased subset of the unique rows examined rather than always
// privileging the first 80 rows of the ordered page.
function sampleCandidates(
  candidates: LadderQuestionCandidate[],
): LadderQuestionCandidate[] {
  if (candidates.length <= MAX_CANDIDATE_POOL) return candidates;
  const sample = [...candidates];
  for (let i = 0; i < MAX_CANDIDATE_POOL; i += 1) {
    const j = i + Math.floor(Math.random() * (sample.length - i));
    [sample[i], sample[j]] = [sample[j], sample[i]];
  }
  return sample.slice(0, MAX_CANDIDATE_POOL);
}

function distinctAvailableCandidates(
  candidates: LadderQuestionCandidate[],
  room: LadderRoomRuntime,
): LadderQuestionCandidate[] {
  const seen = new Set(
    (room.usedQuestionFingerprints ?? []).map(ladderQuestionFingerprint),
  );
  const used = new Set(room.usedQuestionIds ?? []);
  return candidates.filter((candidate) => {
    const key = ladderQuestionFingerprint(candidate.prompt);
    if (
      used.has(candidate.id) ||
      seen.has(key) ||
      !isValidLadderQuestionCandidate(candidate)
    )
      return false;
    seen.add(key);
    return true;
  });
}

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

  return distinctAvailableCandidates(mapRowsToCandidates(rows), room);
}

async function loadBankCandidates(
  database: DatabaseService,
  room: LadderRoomRuntime,
  difficulty?: LadderDifficulty,
): Promise<LadderQuestionCandidate[]> {
  const usedQuestionIds = room.usedQuestionIds ?? [];
  const target = Math.min(
    MAX_CANDIDATE_POOL,
    Math.max(MIN_CANDIDATE_POOL, room.totalRounds * 4),
  );
  const candidates: LadderQuestionCandidate[] = [];
  let offset = 0;
  while (offset < MAX_BANK_ROWS_SCANNED) {
    const pageSize = Math.min(BANK_PAGE_SIZE, MAX_BANK_ROWS_SCANNED - offset);
    const rows = await database.client.question.findMany({
      where: {
        status: 'PUBLISHED',
        type: { in: ['MULTIPLE_CHOICE', 'TRUE_FALSE'] },
        category: { is: { isActive: true } },
        gameTypes: { has: 'LADDER' },
        ...(difficulty ? { difficulty } : {}),
        ...(usedQuestionIds.length > 0
          ? { id: { notIn: usedQuestionIds } }
          : {}),
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
      skip: offset,
      take: pageSize,
    });
    candidates.push(...mapRowsToCandidates(rows));
    const distinct = distinctAvailableCandidates(candidates, room);
    if (distinct.length >= target || rows.length < pageSize)
      return sampleCandidates(distinct);
    offset += rows.length;
  }
  return sampleCandidates(distinctAvailableCandidates(candidates, room));
}

export async function loadLadderQuestionCandidates(
  database: DatabaseService,
  room: LadderRoomRuntime,
  difficulty?: LadderDifficulty,
): Promise<LadderQuestionCandidate[]> {
  const packCandidates = await loadPackCandidates(database, room);
  const minNeeded = Math.max(
    1,
    room.totalRounds - (room.usedQuestionIds?.length ?? 0),
  );
  if (packCandidates.length >= minNeeded) {
    return packCandidates.slice(0, MAX_CANDIDATE_POOL);
  }

  if (packCandidates.length > 0) {
    const bank = await loadPreferredBankCandidates(database, room, difficulty);
    const merged = distinctAvailableCandidates(
      [...packCandidates, ...bank],
      room,
    );
    return merged.slice(0, MAX_CANDIDATE_POOL);
  }

  return loadPreferredBankCandidates(database, room, difficulty);
}

async function loadPreferredBankCandidates(
  database: DatabaseService,
  room: LadderRoomRuntime,
  difficulty?: LadderDifficulty,
): Promise<LadderQuestionCandidate[]> {
  if (difficulty) {
    const targeted = await loadBankCandidates(database, room, difficulty);
    if (targeted.some(isValidLadderQuestionCandidate)) return targeted;
  }
  return loadBankCandidates(database, room);
}

import type { DatabaseService } from '../game/database.service.js';
import type {
  EliminationDifficulty,
  EliminationQuestion,
} from '@tahaddi/domain';

const MAX_QUESTION_POOL = 180;

type OptionRow = {
  id: string;
  position: number;
  text: string;
  isCorrect: boolean;
};

type QuestionRow = {
  id: string;
  prompt: string;
  difficulty: EliminationDifficulty;
  options: OptionRow[];
};

export async function loadEliminationQuestions(
  database: DatabaseService,
): Promise<EliminationQuestion[]> {
  const rows = await database.client.question.findMany({
    where: {
      status: 'PUBLISHED',
      type: 'MULTIPLE_CHOICE',
      archivedAt: null,
      gameTypes: { has: 'QUIZ' },
    },
    select: {
      id: true,
      prompt: true,
      difficulty: true,
      options: {
        orderBy: { position: 'asc' },
        select: { id: true, position: true, text: true, isCorrect: true },
      },
    },
    orderBy: [{ lastEditedAt: 'desc' }, { id: 'asc' }],
    take: MAX_QUESTION_POOL * 3,
  });

  return (rows as QuestionRow[])
    .map((row) => {
      const options = row.options
        .map((option) => option.text.trim())
        .filter((text) => text.length >= 1 && text.length <= 200);
      const correctIndex = row.options.findIndex((option) => option.isCorrect);
      return {
        id: row.id,
        prompt: row.prompt.trim(),
        difficulty: row.difficulty,
        options,
        correctIndex,
      };
    })
    .filter(
      (question) =>
        question.prompt.length > 0 &&
        question.options.length >= 2 &&
        question.options.length <= 4 &&
        question.correctIndex >= 0 &&
        question.correctIndex < question.options.length,
    )
    .slice(0, MAX_QUESTION_POOL);
}

export function pickQuestionForDifficulty(
  questions: readonly EliminationQuestion[],
  difficulty: EliminationDifficulty,
  usedIds: readonly string[],
  random: () => number = Math.random,
): EliminationQuestion | null {
  const candidates = questions.filter(
    (question) =>
      question.difficulty === difficulty && !usedIds.includes(question.id),
  );
  const fallback = questions.filter(
    (question) => !usedIds.includes(question.id),
  );
  const pool = candidates.length > 0 ? candidates : fallback;
  if (pool.length === 0) return null;
  return pool[Math.floor(random() * pool.length)] ?? null;
}

'use server';

import { randomUUID } from 'node:crypto';
import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import { requirePermission } from '@/lib/auth/session';
import { buildQuestionWhere, parseQuestionBankFilters } from '@/lib/questions/admin-filters';
import {
  selectCategoryBalancedQuestions,
  QUIZ_DRAW_POINTS,
} from '@/lib/questions/random-selection';

export type FetchedBankQuestion = {
  id: string;
  prompt: string;
  category: string;
  duration: number;
  points: number;
  questionVersion: number;
  gameTypes: string[];
};

export type FetchBankQuestionsResult =
  { status: 'success'; questions: FetchedBankQuestion[] } | { status: 'error'; message: string };

const FETCH_QUESTIONS_COUNT = 20;

/**
 * Pulls up to 20 published questions balanced across all categories for the game.
 * Published-only by design: only playable questions belong in a room.
 */
export async function fetchBankQuestions(input: {
  category: string;
  q: string;
  difficulty: string;
  game: string;
  time: string;
  includeDescendants?: boolean;
}): Promise<FetchBankQuestionsResult> {
  await requirePermission('MANAGE_CONTENT', '/admin/content');
  if (!hasDatabaseUrl()) {
    return { status: 'error', message: 'قاعدة البيانات غير مهيأة.' };
  }

  const filters = parseQuestionBankFilters({
    category: 'ALL',
    q: '',
    difficulty: 'ALL',
    game: input.game,
    time: 'ANY',
    status: 'PUBLISHED',
    includeDescendants: input.includeDescendants ? '1' : undefined,
  });

  const prisma = getPrismaClient();
  try {
    const where = buildQuestionWhere(filters);
    // الأسئلة بلا خيارات لا يمكن لعبها: استبعدها من الجلب مباشرة.
    const playableWhere: typeof where = { ...where, options: { some: {} } };

    const candidates = await prisma.question.findMany({
      where: playableWhere,
      select: { id: true, prompt: true, categoryId: true },
    });
    if (candidates.length === 0) {
      return {
        status: 'error',
        message: 'لا توجد أسئلة منشورة بخيارات إجابة مطابقة للفلاتر الحالية.',
      };
    }

    const selectedIds = selectCategoryBalancedQuestions(
      candidates,
      randomUUID(),
      FETCH_QUESTIONS_COUNT,
    );
    const rows = await prisma.question.findMany({
      where: { ...playableWhere, id: { in: selectedIds } },
      select: {
        id: true,
        prompt: true,
        timeLimit: true,
        difficulty: true,
        version: true,
        gameTypes: true,
        category: { select: { name: true } },
      },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return {
      status: 'success',
      questions: selectedIds.flatMap((id) => {
        const row = byId.get(id);
        if (!row) return [];
        return [
          {
            id: row.id,
            prompt: row.prompt,
            category: row.category?.name ?? '',
            duration: row.timeLimit,
            points: QUIZ_DRAW_POINTS[row.difficulty],
            questionVersion: row.version,
            gameTypes: row.gameTypes,
          },
        ];
      }),
    };
  } catch {
    return { status: 'error', message: 'تعذّر جلب الأسئلة الآن.' };
  }
}

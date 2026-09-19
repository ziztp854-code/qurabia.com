'use server';

import { randomUUID } from 'node:crypto';
import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import { requirePermission } from '@/lib/auth/session';
import {
  buildQuestionWhere,
  parseQuestionBankFilters,
} from '@/lib/questions/admin-filters';
import {
  categoryScopeNeedsSubtree,
  loadCategorySubtreeIds,
} from '@/lib/questions/category-scope';
import { selectRandomQuestionIds } from '@/lib/questions/random-selection';

export type FetchedBankQuestion = {
  id: string;
  prompt: string;
  category: string;
  duration: number;
  points: number;
  questionVersion: number;
};

export type FetchBankQuestionsResult =
  | { status: 'success'; questions: FetchedBankQuestion[] }
  | { status: 'error'; message: string };

const FETCH_QUESTIONS_COUNT = 20;

/**
 * Pulls a random sample of up to 20 published questions matching the
 * current bank filters, ready to be appended to the quiz-builder draft.
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
    category: input.category,
    q: input.q,
    difficulty: input.difficulty,
    game: input.game,
    time: input.time,
    status: 'PUBLISHED',
    includeDescendants: input.includeDescendants ? '1' : undefined,
  });

  const prisma = getPrismaClient();
  try {
    const categoryIds = categoryScopeNeedsSubtree(filters.category, filters.includeDescendants)
      ? await loadCategorySubtreeIds(prisma, filters.category)
      : undefined;
    const where = buildQuestionWhere(filters, { categoryIds });

    const candidates = await prisma.question.findMany({ where, select: { id: true } });
    if (candidates.length === 0) {
      return { status: 'error', message: 'لا توجد أسئلة منشورة مطابقة للفلاتر الحالية.' };
    }

    const selectedIds = selectRandomQuestionIds(
      candidates.map((candidate) => candidate.id),
      randomUUID(),
      FETCH_QUESTIONS_COUNT,
    );
    const rows = await prisma.question.findMany({
      where: { id: { in: selectedIds } },
      select: {
        id: true,
        prompt: true,
        timeLimit: true,
        basePoints: true,
        version: true,
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
            points: row.basePoints,
            questionVersion: row.version,
          },
        ];
      }),
    };
  } catch {
    return { status: 'error', message: 'تعذّر جلب الأسئلة الآن.' };
  }
}

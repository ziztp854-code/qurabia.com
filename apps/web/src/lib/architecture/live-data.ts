import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import type {
  ArchitectureHealth,
  ArchitectureLiveData,
  CategoryArchitectureSummary,
  QuestionGameKey,
} from './types';

const GAME_KEYS = new Set<QuestionGameKey>([
  'QUIZ',
  'LADDER',
  'CATEGORY_BOARD',
  'LETTER_CHALLENGE',
  'MILLIONAIRE',
]);

export async function getArchitectureLiveData(): Promise<ArchitectureLiveData> {
  const generatedAt = new Date().toISOString();
  if (!hasDatabaseUrl()) {
    return {
      available: false,
      generatedAt,
      totals: { total: 0, published: 0, draft: 0, archived: 0, uncategorized: 0 },
      categories: [],
      health: [{ id: 'database', label: 'بيانات الخريطة الحية', status: 'problem', message: 'قاعدة البيانات غير مهيأة.', evidence: 'hasDatabaseUrl() = false' }],
      letterCoverage: null,
      boardCoverage: null,
    };
  }

  try {
    const prisma = getPrismaClient();
    const [categories, groups, uncategorized, gameGroups] = await Promise.all([
      prisma.category.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      prisma.question.groupBy({
        by: ['categoryId', 'status', 'difficulty'],
        _count: { _all: true },
      }),
      prisma.question.count({ where: { categoryId: null } }),
      prisma.question.groupBy({
        by: ['categoryId', 'gameTypes'],
        where: { status: 'PUBLISHED' },
        _count: { _all: true },
      }),
    ]);

    const gamesByCategory = new Map<string, Set<QuestionGameKey>>();
    for (const group of gameGroups) {
      if (!group.categoryId) continue;
      const set = gamesByCategory.get(group.categoryId) ?? new Set<QuestionGameKey>();
      for (const game of group.gameTypes) {
        if (GAME_KEYS.has(game as QuestionGameKey)) set.add(game as QuestionGameKey);
      }
      gamesByCategory.set(group.categoryId, set);
    }

    const categoriesSummary: CategoryArchitectureSummary[] = categories.map((category) => {
      const relevant = groups.filter((group) => group.categoryId === category.id);
      const count = (status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED') => relevant
        .filter((group) => !status || group.status === status)
        .reduce((sum, group) => sum + group._count._all, 0);
      const difficulty = (value: 'EASY' | 'MEDIUM' | 'HARD') => relevant
        .filter((group) => group.difficulty === value)
        .reduce((sum, group) => sum + group._count._all, 0);
      return {
        id: category.id,
        name: category.name,
        total: count(),
        published: count('PUBLISHED'),
        draft: count('DRAFT'),
        archived: count('ARCHIVED'),
        difficulty: { EASY: difficulty('EASY'), MEDIUM: difficulty('MEDIUM'), HARD: difficulty('HARD') },
        games: [...(gamesByCategory.get(category.id) ?? [])],
      };
    });

    const totals = {
      total: groups.reduce((sum, group) => sum + group._count._all, 0),
      published: groups.filter((g) => g.status === 'PUBLISHED').reduce((sum, g) => sum + g._count._all, 0),
      draft: groups.filter((g) => g.status === 'DRAFT').reduce((sum, g) => sum + g._count._all, 0),
      archived: groups.filter((g) => g.status === 'ARCHIVED').reduce((sum, g) => sum + g._count._all, 0),
      uncategorized,
    };
    const emptyCategories = categoriesSummary.filter((category) => category.total === 0).length;
    const health: ArchitectureHealth[] = [
      { id: 'route', label: 'مسار الخريطة', status: 'healthy', message: '/architecture موجود ومحمي بصلاحية VIEW_AUDIT.', evidence: 'apps/web/src/app/architecture/page.tsx' },
      { id: 'categories', label: 'ربط التصنيفات', status: categories.length ? 'healthy' : 'problem', message: `${categories.length} تصنيفًا حقيقيًا من قاعدة البيانات.`, evidence: 'Category → Question.categoryId' },
      { id: 'uncategorized', label: 'أسئلة بدون تصنيف', status: uncategorized === 0 ? 'healthy' : 'review', message: uncategorized === 0 ? 'لا توجد أسئلة بدون تصنيف.' : `${uncategorized} سؤالًا يحتاج التصنيف.`, evidence: 'Question.categoryId IS NULL' },
      { id: 'empty-categories', label: 'تصنيفات فارغة', status: emptyCategories === 0 ? 'healthy' : 'review', message: emptyCategories === 0 ? 'كل التصنيفات تحتوي أسئلة.' : `${emptyCategories} تصنيفًا بلا أسئلة.`, evidence: 'Category LEFT JOIN Question aggregate' },
      { id: 'letter-engine', label: 'تغطية تحدي الحروف', status: 'review', message: 'لا يوجد حقل Answer Letter أو محرك Route منفذ؛ لا يمكن حساب تغطية الحروف بثقة.', evidence: 'prisma/schema.prisma + App Router audit' },
      { id: 'board-values', label: 'تغطية لوحة الفئات', status: 'review', message: 'لا يوجد Board Value في Question أو محرك لوحة منفذ؛ المصفوفة غير متاحة.', evidence: 'prisma/schema.prisma + App Router audit' },
    ];

    return { available: true, generatedAt, totals, categories: categoriesSummary, health, letterCoverage: null, boardCoverage: null };
  } catch {
    return {
      available: false,
      generatedAt,
      totals: { total: 0, published: 0, draft: 0, archived: 0, uncategorized: 0 },
      categories: [],
      health: [{ id: 'database-query', label: 'ملخص البيانات الحية', status: 'problem', message: 'تعذر تحميل التجميعات الآمنة الآن.', evidence: 'Prisma aggregate query failed' }],
      letterCoverage: null,
      boardCoverage: null,
    };
  }
}

import type { Prisma } from '@tahaddi/database';

export const QUESTION_STATUSES = ['ALL', 'DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export const QUESTION_DIFFICULTIES = ['ALL', 'EASY', 'MEDIUM', 'HARD'] as const;
export const QUESTION_TYPES = ['ALL', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER'] as const;
export const QUESTION_GAMES = [
  'ALL',
  'QUIZ',
  'LADDER',
  'CATEGORY_BOARD',
  'LETTER_CHALLENGE',
  'MILLIONAIRE',
  'QUESTION_WORD',
] as const;
export const QUESTION_TIME_BUCKETS = ['ANY', 'FAST', 'STANDARD', 'EXTENDED'] as const;

export type QuestionStatusFilter = (typeof QUESTION_STATUSES)[number];
export type QuestionDifficultyFilter = (typeof QUESTION_DIFFICULTIES)[number];
export type QuestionTypeFilter = (typeof QUESTION_TYPES)[number];
export type QuestionGameFilter = (typeof QUESTION_GAMES)[number];
export type QuestionTimeBucket = (typeof QUESTION_TIME_BUCKETS)[number];
export type QuestionGame = Exclude<QuestionGameFilter, 'ALL'>;
export type QuestionCategoryFilter = 'ALL' | 'UNCATEGORIZED' | string;

export type QuestionBankFilters = {
  category: QuestionCategoryFilter;
  q: string;
  status: QuestionStatusFilter;
  difficulty: QuestionDifficultyFilter;
  type: QuestionTypeFilter;
  game: QuestionGameFilter;
  time: QuestionTimeBucket;
  keyword: string;
  page: number;
  /** When set, search across the entire subtree of this category. */
  includeDescendants: boolean;
};

type SearchValues = Record<string, string | string[] | undefined>;

function valueOf(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : '';
}

function oneOf<const Values extends readonly string[]>(
  value: string,
  values: Values,
  fallback: Values[number],
): Values[number] {
  return values.includes(value as Values[number]) ? (value as Values[number]) : fallback;
}

function parseBoolean(value: string): boolean {
  return value === '1' || value.toLowerCase() === 'true';
}

export function parseQuestionBankFilters(values: SearchValues): QuestionBankFilters {
  const rawCategory = valueOf(values.category).trim();
  const rawPage = Number.parseInt(valueOf(values.page), 10);
  const rawIncludeDescendants = valueOf(values.includeDescendants);

  return {
    category: rawCategory || 'ALL',
    q: valueOf(values.q).trim().slice(0, 200),
    status: oneOf(valueOf(values.status), QUESTION_STATUSES, 'ALL'),
    difficulty: oneOf(valueOf(values.difficulty), QUESTION_DIFFICULTIES, 'ALL'),
    type: oneOf(valueOf(values.type), QUESTION_TYPES, 'ALL'),
    game: oneOf(valueOf(values.game), QUESTION_GAMES, 'ALL'),
    time: oneOf(valueOf(values.time), QUESTION_TIME_BUCKETS, 'ANY'),
    keyword: valueOf(values.keyword).trim().slice(0, 60),
    page: Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 100_000) : 1,
    includeDescendants: parseBoolean(rawIncludeDescendants),
  };
}

const TIME_BOUNDS: Record<Exclude<QuestionTimeBucket, 'ANY'>, { min: number; max: number }> = {
  FAST: { min: 5, max: 15 },
  STANDARD: { min: 16, max: 45 },
  EXTENDED: { min: 46, max: 300 },
};

export function buildTimeWhere(
  bucket: QuestionTimeBucket,
): Pick<Prisma.QuestionWhereInput, 'timeLimit'> {
  if (bucket === 'ANY') return {} as Pick<Prisma.QuestionWhereInput, 'timeLimit'>;
  return { timeLimit: TIME_BOUNDS[bucket] as Prisma.IntFilter };
}

export function buildQuestionWhere(
  filters: QuestionBankFilters,
  options: {
    categoryIds?: ReadonlyArray<string>;
  } = {},
): Prisma.QuestionWhereInput {
  const status =
    filters.status === 'ALL'
      ? { in: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as Array<'DRAFT' | 'PUBLISHED' | 'ARCHIVED'> }
      : filters.status;
  const categoryFilter =
    filters.category === 'ALL'
      ? {}
      : filters.category === 'UNCATEGORIZED'
        ? { categoryId: null }
        : filters.includeDescendants && options.categoryIds
          ? { categoryId: { in: [...options.categoryIds] } }
          : { categoryId: filters.category };
  return {
    ...categoryFilter,
    status,
    ...(filters.difficulty === 'ALL' ? {} : { difficulty: filters.difficulty }),
    ...(filters.type === 'ALL' ? {} : { type: filters.type }),
    ...(filters.game === 'ALL' ? {} : { gameTypes: { has: filters.game } }),
    ...buildTimeWhere(filters.time),
    ...(filters.keyword ? { keywords: { has: filters.keyword } } : {}),
    ...(filters.q ? { prompt: { contains: filters.q, mode: 'insensitive' as const } } : {}),
  };
}

export function buildPublishedGameQuestionWhere(
  categoryId: string | null,
  game: QuestionGame,
): Prisma.QuestionWhereInput {
  return {
    ...(categoryId ? { categoryId } : {}),
    status: 'PUBLISHED',
    gameTypes: { has: game },
  };
}

export function buildQuestionBankHref(
  filters: QuestionBankFilters,
  overrides: Partial<QuestionBankFilters> = {},
) {
  const next = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (next.category !== 'ALL') params.set('category', next.category);
  if (next.q) params.set('q', next.q);
  if (next.status !== 'ALL') params.set('status', next.status);
  if (next.difficulty !== 'ALL') params.set('difficulty', next.difficulty);
  if (next.type !== 'ALL') params.set('type', next.type);
  if (next.game !== 'ALL') params.set('game', next.game);
  if (next.time !== 'ANY') params.set('time', next.time);
  if (next.keyword) params.set('keyword', next.keyword);
  if (next.includeDescendants) params.set('includeDescendants', '1');
  if (next.page > 1) params.set('page', String(next.page));
  const query = params.toString();
  return query ? `/admin/content?${query}` : '/admin/content';
}

export const TIME_BUCKET_LABELS: Record<QuestionTimeBucket, string> = {
  ANY: 'كل الأوقات',
  FAST: 'سريع (5–15 ث)',
  STANDARD: 'متوسط (16–45 ث)',
  EXTENDED: 'طويل (46–300 ث)',
};

export const TYPE_LABELS: Record<QuestionTypeFilter, string> = {
  ALL: 'كل الأنواع',
  MULTIPLE_CHOICE: 'اختيار من متعدد',
  TRUE_FALSE: 'صح وخطأ',
  SHORT_ANSWER: 'إجابة قصيرة',
};

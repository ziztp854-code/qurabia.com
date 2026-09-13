import { randomUUID } from 'node:crypto';
import { BookOpen, Filter, Plus } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout';
import { Button, ButtonLink, Input, Select } from '@/components/ui';
import { QuestionBankCleanupActions } from '@/components/questions/question-bank-cleanup-actions';
import { QuizDraftTray } from '@/components/questions/quiz-draft-tray';
import { QuestionBankIndex, QuestionBankStats } from '@/components/questions/question-bank-index';
import { QuestionCatalog } from '@/components/questions/question-catalog';
import { QuestionComposer } from '@/components/questions/question-composer';
import { QuestionEditor } from '@/components/questions/question-editor';
import { QuestionBankShell } from '@/components/questions/question-bank-shell';
import pageStyles from '@/components/questions/question-bank-page.module.css';
import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import { requireQuestionManager } from '@/lib/auth/session';
import {
  parseBankView,
  STATUS_LABEL,
  TYPE_LABEL,
  DIFFICULTY_LABEL,
} from '@/lib/questions/bank-display';
import {
  getMasterDomainForCategory,
  groupQuestionsByCanonicalCategory,
  listCanonicalFilterOptions,
  MASTER_DOMAINS,
  normalizeCategoryName,
  type MasterDomainId,
} from '@/lib/questions/bank-index';
import { questionsListHref } from '@/lib/questions/list-href';
import { selectRandomQuestionIds } from '@/lib/questions/random-selection';

const statuses = ['ALL', 'DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
const types = ['ALL', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER'] as const;
const difficulties = ['ALL', 'EASY', 'MEDIUM', 'HARD'] as const;
const games = [
  'ALL',
  'QUIZ',
  'LADDER',
  'CATEGORY_BOARD',
  'LETTER_CHALLENGE',
  'MILLIONAIRE',
  'QUESTION_WORD',
] as const;
const gameLabels = {
  ALL: 'كل الألعاب',
  QUIZ: 'المسابقات',
  LADDER: 'السلم',
  CATEGORY_BOARD: 'لوحة الفئات',
  LETTER_CHALLENGE: 'تحدي الحروف',
  MILLIONAIRE: 'من سيربح المليون',
  QUESTION_WORD: 'كلمة وسؤال',
} as const;
const PAGE_SIZE = 40;

export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    type?: string;
    difficulty?: string;
    game?: string;
    category?: string;
    domain?: string;
    canonical?: string;
    page?: string;
    random?: string;
    view?: string;
  }>;
}) {
  await requireQuestionManager('/questions');
  const filters = await searchParams;
  const q = filters.q?.trim() || '';
  const domain = filters.domain?.trim() as MasterDomainId | undefined;
  const categoryId = filters.category?.trim() || '';
  const canonical = filters.canonical?.trim() || '';
  const randomSeed = filters.random?.trim().slice(0, 128) || '';
  const view = parseBankView(filters.view);
  const page = Math.min(1000, Math.max(1, Number.parseInt(filters.page || '1', 10) || 1));

  const status = statuses.includes(filters.status as (typeof statuses)[number])
    ? (filters.status as Exclude<(typeof statuses)[number], 'ALL'> | 'ALL')
    : 'ALL';
  const type = types.includes(filters.type as (typeof types)[number])
    ? (filters.type as Exclude<(typeof types)[number], 'ALL'> | 'ALL')
    : 'ALL';
  const difficulty = difficulties.includes(filters.difficulty as (typeof difficulties)[number])
    ? (filters.difficulty as Exclude<(typeof difficulties)[number], 'ALL'> | 'ALL')
    : 'ALL';
  const game = games.includes(filters.game as (typeof games)[number])
    ? (filters.game as Exclude<(typeof games)[number], 'ALL'> | 'ALL')
    : 'ALL';

  const prisma = getPrismaClient();

  const [categories, totalCount, publishedCount, draftCount] = hasDatabaseUrl()
    ? await Promise.all([
        prisma.category.findMany({
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            _count: { select: { questions: { where: { status: { not: 'ARCHIVED' } } } } },
          },
        }),
        prisma.question.count({ where: { status: { not: 'ARCHIVED' } } }),
        prisma.question.count({ where: { status: 'PUBLISHED' } }),
        prisma.question.count({ where: { status: 'DRAFT' } }),
      ])
    : [[], 0, 0, 0];

  const matchedDomain = MASTER_DOMAINS.find((d) => d.id === domain);
  const domainCategoryIds = matchedDomain
    ? categories
        .filter((cat) => getMasterDomainForCategory(cat.name).id === matchedDomain.id)
        .map((cat) => cat.id)
    : [];

  const sortedCategories = [...categories].sort((a, b) => {
    const aCanon = normalizeCategoryName(a.name) ?? a.name;
    const bCanon = normalizeCategoryName(b.name) ?? b.name;
    const byCanon = aCanon.localeCompare(bCanon, 'ar');
    if (byCanon !== 0) return byCanon;
    return a.name.localeCompare(b.name, 'ar');
  });

  const canonicalCategoryIds = canonical
    ? categories
        .filter((cat) => (normalizeCategoryName(cat.name) ?? cat.name) === canonical)
        .map((cat) => cat.id)
    : [];

  const canonicalOptions = listCanonicalFilterOptions(categories);

  const questionWhere = {
    ...(status === 'ALL' ? { status: { not: 'ARCHIVED' as const } } : { status }),
    ...(type === 'ALL' ? {} : { type }),
    ...(difficulty === 'ALL' ? {} : { difficulty }),
    ...(game === 'ALL' ? {} : { gameTypes: { has: game } }),
    ...(categoryId
      ? { categoryId }
      : canonicalCategoryIds.length > 0
        ? { categoryId: { in: canonicalCategoryIds } }
        : domainCategoryIds.length > 0
          ? { categoryId: { in: domainCategoryIds } }
          : {}),
    ...(q
      ? {
          OR: [
            { prompt: { contains: q, mode: 'insensitive' as const } },
            { category: { name: { contains: q, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  };

  const questionInclude = {
    category: { select: { id: true, name: true } },
    options: { orderBy: { position: 'asc' as const }, select: { id: true } },
  } as const;

  const { questions, matchingCount } = !hasDatabaseUrl()
    ? { questions: [], matchingCount: 0 }
    : randomSeed
      ? await (async () => {
          const candidates = await prisma.question.findMany({
            where: questionWhere,
            select: { id: true },
          });
          const selectedIds = selectRandomQuestionIds(
            candidates.map((question) => question.id),
            randomSeed,
            PAGE_SIZE,
          );
          const selectedQuestions = await prisma.question.findMany({
            where: { id: { in: selectedIds } },
            include: questionInclude,
          });
          const questionById = new Map(
            selectedQuestions.map((question) => [question.id, question]),
          );
          return {
            questions: selectedIds.flatMap((id) => {
              const question = questionById.get(id);
              return question ? [question] : [];
            }),
            matchingCount: candidates.length,
          };
        })()
      : await (async () => {
          const [orderedQuestions, count] = await Promise.all([
            prisma.question.findMany({
              where: questionWhere,
              orderBy: [{ category: { name: 'asc' } }, { updatedAt: 'desc' }],
              skip: (page - 1) * PAGE_SIZE,
              take: PAGE_SIZE,
              include: questionInclude,
            }),
            prisma.question.count({ where: questionWhere }),
          ]);
          return { questions: orderedQuestions, matchingCount: count };
        })();

  const pageCount = Math.max(1, Math.ceil(matchingCount / PAGE_SIZE));
  const listQuery = {
    q: q || undefined,
    status: status === 'ALL' ? undefined : status,
    type: type === 'ALL' ? undefined : type,
    difficulty: difficulty === 'ALL' ? undefined : difficulty,
    game: game === 'ALL' ? undefined : game,
    domain: domain || undefined,
    canonical: canonical || undefined,
    category: categoryId || undefined,
    view: view === 'list' ? 'list' : undefined,
  };
  const groupedQuestions = groupQuestionsByCanonicalCategory(questions);
  const hasActiveFilters = Boolean(
    q ||
    domain ||
    canonical ||
    status !== 'ALL' ||
    type !== 'ALL' ||
    difficulty !== 'ALL' ||
    game !== 'ALL',
  );

  return (
    <DashboardLayout
      className="command-bank-layout"
      title="بنك الأسئلة المركزي"
      description="تصفح المجالات، اعرض الأسئلة كمنصة أو قائمة، ثم أضف إلى المسابقة أو عدّل."
      actions={
        <ButtonLink href="#question-editor" variant="gold">
          <Plus aria-hidden="true" />
          إضافة سؤال
        </ButtonLink>
      }
    >
      <QuestionBankShell className={pageStyles.page}>
        <header className={pageStyles.hero}>
          <Image
            className={pageStyles.heroCrown}
            src="/home/tahaddi-crown-transparent-1024x683.webp"
            alt=""
            width={460}
            height={306}
            priority
          />
          <div className={pageStyles.heroCopy}>
            <span className={pageStyles.heroKicker}>
              <BookOpen aria-hidden="true" /> بنك الأسئلة
            </span>
            <h2>اختر أسئلة مسابقتك من الخزانة المركزية</h2>
            <p>تصفّح المجالات المعرفية، صفِّ حسب الصعوبة والنوع، ثم أضف إلى مسابقتك.</p>
            <ButtonLink href="#question-editor" variant="gold">
              <Plus aria-hidden="true" /> إضافة سؤال جديد
            </ButtonLink>
          </div>
        </header>

        <QuestionBankStats
          categories={sortedCategories}
          totalQuestionsCount={totalCount}
          publishedCount={publishedCount}
          draftCount={draftCount}
          categoryCount={categories.length}
        />

        <section className={pageStyles.searchPanel} aria-labelledby="question-search-heading">
          <p className={pageStyles.searchEyebrow}>بحث</p>
          <h2 id="question-search-heading">ابحث ثم صفِّ بنك الأسئلة</h2>
          <p className={pageStyles.searchIntro}>
            النص يبحث في السؤال والفئة. التصفية المتقدمة تبقي المجالات والأنواع خارج الطريق حتى
            تحتاجها.
          </p>
          <form action="/questions">
            {view === 'list' ? <input type="hidden" name="view" value="list" /> : null}
            <div className={pageStyles.searchPrimary}>
              <Input label="ابحث في نص السؤال أو الفئة" name="q" defaultValue={q} />
              <Select label="حالة السؤال" name="status" defaultValue={status}>
                <option value="ALL">كل المسودات والمنشور</option>
                <option value="DRAFT">مسودة</option>
                <option value="PUBLISHED">منشور</option>
                <option value="ARCHIVED">مؤرشف</option>
              </Select>
              <Select label="الصعوبة" name="difficulty" defaultValue={difficulty}>
                <option value="ALL">كل المستويات</option>
                <option value="EASY">سهل</option>
                <option value="MEDIUM">متوسط</option>
                <option value="HARD">صعب</option>
              </Select>
              <Button type="submit" variant="outline">
                تطبيق التصفية
              </Button>
            </div>

            <details
              className={pageStyles.searchAdvanced}
              open={Boolean(domain || canonical || type !== 'ALL' || game !== 'ALL')}
            >
              <summary>
                <Filter aria-hidden="true" size={16} />
                تصفية متقدمة
              </summary>
              <div className={`form-grid ${pageStyles.searchAdvancedBody}`}>
                <Select label="المجال المعرفي" name="domain" defaultValue={domain || ''}>
                  <option value="">كل المجالات المعرفية</option>
                  {MASTER_DOMAINS.map((dom) => (
                    <option key={dom.id} value={dom.id}>
                      {dom.name}
                    </option>
                  ))}
                </Select>
                <Select label="التصنيف الكانوني" name="canonical" defaultValue={canonical}>
                  <option value="">كل التصنيفات المنظمة ({canonicalOptions.length})</option>
                  {canonicalOptions.map((option) => (
                    <option key={option.name} value={option.name}>
                      {option.name} ({option.count})
                    </option>
                  ))}
                </Select>
                <Select label="النوع" name="type" defaultValue={type}>
                  <option value="ALL">كل الأنواع</option>
                  <option value="MULTIPLE_CHOICE">اختيار متعدد</option>
                  <option value="TRUE_FALSE">صح أو خطأ</option>
                  <option value="SHORT_ANSWER">إجابة قصيرة</option>
                </Select>
                <Select label="اللعبة" name="game" defaultValue={game}>
                  {games.map((value) => (
                    <option key={value} value={value}>
                      {gameLabels[value]}
                    </option>
                  ))}
                </Select>
              </div>
            </details>
          </form>

          {hasActiveFilters ? (
            <div className={pageStyles.activeFilters} aria-label="التصفيات النشطة">
              {q ? (
                <Link href={questionsListHref({ ...listQuery, q: undefined, page: undefined })}>
                  بحث: {q} ×
                </Link>
              ) : null}
              {domain ? (
                <Link
                  href={questionsListHref({ ...listQuery, domain: undefined, page: undefined })}
                >
                  {matchedDomain?.name ?? domain} ×
                </Link>
              ) : null}
              {canonical ? (
                <Link
                  href={questionsListHref({ ...listQuery, canonical: undefined, page: undefined })}
                >
                  {canonical} ×
                </Link>
              ) : null}
              {status !== 'ALL' ? (
                <Link
                  href={questionsListHref({ ...listQuery, status: undefined, page: undefined })}
                >
                  {STATUS_LABEL[status]} ×
                </Link>
              ) : null}
              {type !== 'ALL' ? (
                <Link href={questionsListHref({ ...listQuery, type: undefined, page: undefined })}>
                  {TYPE_LABEL[type]} ×
                </Link>
              ) : null}
              {difficulty !== 'ALL' ? (
                <Link
                  href={questionsListHref({ ...listQuery, difficulty: undefined, page: undefined })}
                >
                  {DIFFICULTY_LABEL[difficulty]} ×
                </Link>
              ) : null}
              {game !== 'ALL' ? (
                <Link href={questionsListHref({ ...listQuery, game: undefined, page: undefined })}>
                  {gameLabels[game]} ×
                </Link>
              ) : null}
              <Link href={questionsListHref({ view: listQuery.view })}>مسح الكل</Link>
            </div>
          ) : null}
        </section>

        <QuestionBankIndex
          categories={sortedCategories}
          activeDomain={domain}
          activeCanonical={canonical}
          activeView={view}
        />

        <div className={pageStyles.workspace}>
          <QuizDraftTray />

          <QuestionComposer defaultOpen={matchingCount === 0}>
            <QuestionEditor categories={categories} />
          </QuestionComposer>

          <QuestionCatalog
            groups={groupedQuestions}
            view={view}
            matchingCount={matchingCount}
            randomSeed={randomSeed}
            randomHref={questionsListHref({ ...listQuery, random: randomUUID() })}
            page={page}
            pageCount={pageCount}
            listQuery={listQuery}
          />
        </div>

        <details className={pageStyles.adminPanel}>
          <summary>أدوات الإدارة</summary>
          <div className={pageStyles.adminBody}>
            <p>عمليات إعداد المسابقة والتنظيف تبقى متاحة هنا حتى لا تنافس تصفح البنك.</p>
            <div className={pageStyles.adminActions}>
              <ButtonLink href="/quizzes/new" variant="outline">
                منشئ المسابقة
              </ButtonLink>
              <QuestionBankCleanupActions />
            </div>
          </div>
        </details>
      </QuestionBankShell>
    </DashboardLayout>
  );
}

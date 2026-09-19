import { formatNumber } from '@/lib/utils';
import { FileQuestion } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui';
import styles from '@/components/admin/admin.module.css';
import { QuestionBankFilters } from '@/components/admin/question-bank-filters';
import { getPrismaClient } from '@/lib/auth/prisma';
import { requirePermission } from '@/lib/auth/session';
import {
  buildQuestionBankHref,
  buildQuestionWhere,
  parseQuestionBankFilters,
} from '@/lib/questions/admin-filters';
import { categoryScopeNeedsSubtree, loadCategorySubtreeIds } from '@/lib/questions/category-scope';
import { updateContentStatus } from './actions';

const PAGE_SIZE = 30;
const difficultyLabels = { EASY: 'سهل', MEDIUM: 'متوسط', HARD: 'صعب' } as const;
const statusLabels = { DRAFT: 'مسودة', PUBLISHED: 'منشور', ARCHIVED: 'مؤرشف' } as const;
const gameLabels = {
  QUIZ: 'المسابقات',
  LADDER: 'لعبة السلم',
  CATEGORY_BOARD: 'لوحة الفئات',
  LETTER_CHALLENGE: 'تحدي الحروف',
  MILLIONAIRE: 'من سيربح المليون',
  QUESTION_WORD: 'كلمة وسؤال',
} as const;

const messages: Readonly<Record<string, string>> = {
  UPDATED: 'تم تحديث حالة المحتوى وتسجيل الإجراء.',
  CONTENT_INCOMPLETE: 'لا يمكن النشر قبل اكتمال الأسئلة والإجابات المطلوبة.',
  INVALID_REQUEST: 'تعذّر العثور على المحتوى المطلوب.',
  REQUEST_FAILED: 'تعذّر تنفيذ التغيير الآن.',
  SESSION_REVOKED: 'تغيّرت صلاحية جلستك. سجّل الدخول من جديد.',
  INSUFFICIENT_PERMISSION: 'إدارة الأسئلة متاحة للأدمن والمدير فقط.',
};

function valueOf(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : '';
}

export default async function AdminContentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission('MANAGE_CONTENT', '/admin/content');
  const values = await searchParams;
  const result = valueOf(values.result);
  const filters = parseQuestionBankFilters(values);
  const prisma = getPrismaClient();
  // Mirror the admin bank API: a category filter with includeDescendants
  // must search the whole subtree, not only the exact category.
  const categoryIds = categoryScopeNeedsSubtree(filters.category, filters.includeDescendants)
    ? await loadCategorySubtreeIds(prisma, filters.category)
    : undefined;
  const where = buildQuestionWhere(filters, { categoryIds });

  const [categories, totalCount, uncategorizedCount, filteredCount, questions, quizzes] =
    await Promise.all([
      prisma.category.findMany({
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          _count: {
            select: { questions: { where: { status: { in: ['DRAFT', 'PUBLISHED'] } } } },
          },
        },
      }),
      prisma.question.count({ where: { status: { in: ['DRAFT', 'PUBLISHED'] } } }),
      prisma.question.count({
        where: { categoryId: null, status: { in: ['DRAFT', 'PUBLISHED'] } },
      }),
      prisma.question.count({ where }),
      prisma.question.findMany({
        where,
        // Same authority as the admin bank API: lastEditedAt with an id
        // tiebreaker, so both surfaces order the bank identically.
        orderBy: [{ lastEditedAt: 'desc' }, { id: 'desc' }],
        skip: (filters.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          prompt: true,
          status: true,
          difficulty: true,
          gameTypes: true,
          updatedAt: true,
          category: { select: { name: true } },
          owner: { select: { name: true, email: true } },
          _count: { select: { options: true } },
        },
      }),
      prisma.quiz.findMany({
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          title: true,
          status: true,
          owner: { select: { name: true, email: true } },
          _count: { select: { questions: true } },
        },
      }),
    ]);

  const selectedCategory =
    filters.category === 'ALL'
      ? 'كل التصنيفات'
      : filters.category === 'UNCATEGORIZED'
        ? 'بدون تصنيف'
        : categories.find((category) => category.id === filters.category)?.name ||
          'تصنيف غير معروف';
  const lastPage = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <span className={styles.eyebrow}>
            <FileQuestion aria-hidden="true" />
            بنك مركزي واحد
          </span>
          <h2>بنك الأسئلة</h2>
          <p>
            {selectedCategory} · {formatNumber(filteredCount)} سؤال مطابق
          </p>
        </div>
      </div>

      {result && messages[result] && (
        <p className={styles.notice} role="status">
          {messages[result]}
        </p>
      )}

      <QuestionBankFilters
        categories={categories.map((category) => ({
          id: category.id,
          name: category.name,
          count: category._count.questions,
        }))}
        filters={filters}
        totalCount={totalCount}
        uncategorizedCount={uncategorizedCount}
      />

      <section className={styles.panel} aria-labelledby="questions-heading">
        <div className={styles.sectionHeader}>
          <div>
            <h3 id="questions-heading">الأسئلة</h3>
            <p>البحث والفلاتر يعملان داخل التصنيف المختار.</p>
          </div>
          <span className={styles.muted}>
            صفحة {formatNumber(Math.min(filters.page, lastPage))} من {formatNumber(lastPage)}
          </span>
        </div>
        {questions.length === 0 ? (
          <p className={styles.notice}>لا توجد أسئلة مطابقة لهذه الفلاتر.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>السؤال</th>
                <th>التصنيف</th>
                <th>الصعوبة</th>
                <th>اللعبة</th>
                <th>الحالة</th>
                <th>الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {questions.map((question, index) => (
                <tr key={question.id}>
                  <td data-label="السؤال">
                    <span className={styles.identity}>
                      <Link href={`/questions/${question.id}?admin=1`}>
                        {(filters.page - 1) * PAGE_SIZE + index + 1}. {question.prompt}
                      </Link>
                      <small>
                        {question.owner.name || question.owner.email || '—'} ·{' '}
                        {formatNumber(question._count.options)} خيارات
                      </small>
                    </span>
                  </td>
                  <td data-label="التصنيف">{question.category?.name || 'بدون تصنيف'}</td>
                  <td data-label="الصعوبة">{difficultyLabels[question.difficulty]}</td>
                  <td data-label="اللعبة">
                    <span className={styles.compactMeta}>
                      {question.gameTypes.map((game) => gameLabels[game]).join('، ')}
                    </span>
                  </td>
                  <td data-label="الحالة">{statusLabels[question.status]}</td>
                  <td data-label="الإجراء">
                    <div className={styles.tableActions}>
                      <form action={updateContentStatus}>
                        <input type="hidden" name="resourceType" value="Question" />
                        <input type="hidden" name="resourceId" value={question.id} />
                        <input
                          type="hidden"
                          name="nextStatus"
                          value={question.status === 'PUBLISHED' ? 'ARCHIVED' : 'PUBLISHED'}
                        />
                        <Button type="submit" variant="outline" size="sm">
                          {question.status === 'PUBLISHED' ? 'أرشفة' : 'نشر'}
                        </Button>
                      </form>
                      <Link href={`/questions/${question.id}?admin=1`} prefetch={false}>
                        <Button variant="ghost" size="sm">
                          تعديل
                        </Button>
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {lastPage > 1 && (
          <nav className={styles.pagination} aria-label="صفحات بنك الأسئلة">
            {filters.page > 1 ? (
              <Link href={buildQuestionBankHref(filters, { page: filters.page - 1 })}>
                الصفحة السابقة
              </Link>
            ) : (
              <span />
            )}
            {filters.page < lastPage && (
              <Link href={buildQuestionBankHref(filters, { page: filters.page + 1 })}>
                الصفحة التالية
              </Link>
            )}
          </nav>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="quizzes-heading">
        <div className={styles.sectionHeader}>
          <div>
            <h3 id="quizzes-heading">المسابقات المنشأة</h3>
            <p>تستخدم أسئلة البنك المركزي دون نسخها.</p>
          </div>
        </div>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>المسابقة</th>
              <th>المالك</th>
              <th>الحالة</th>
              <th>عدد الأسئلة</th>
              <th>الإجراء</th>
            </tr>
          </thead>
          <tbody>
            {quizzes.map((quiz) => (
              <tr key={quiz.id}>
                <td data-label="المسابقة">{quiz.title}</td>
                <td data-label="المالك">{quiz.owner.name || quiz.owner.email || '—'}</td>
                <td data-label="الحالة">{quiz.status}</td>
                <td data-label="عدد الأسئلة">{formatNumber(quiz._count.questions)}</td>
                <td data-label="الإجراء">
                  <form action={updateContentStatus}>
                    <input type="hidden" name="resourceType" value="Quiz" />
                    <input type="hidden" name="resourceId" value={quiz.id} />
                    <input
                      type="hidden"
                      name="nextStatus"
                      value={quiz.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE'}
                    />
                    <Button type="submit" variant="outline" size="sm">
                      {quiz.status === 'ACTIVE' ? 'أرشفة' : 'نشر'}
                    </Button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

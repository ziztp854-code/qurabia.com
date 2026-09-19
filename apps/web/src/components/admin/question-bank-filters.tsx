import { formatNumber } from '@/lib/utils';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { FetchBankQuestionsButton } from '@/components/admin/fetch-bank-questions-button';
import {
  buildQuestionBankHref,
  type QuestionBankFilters as ActiveFilters,
} from '@/lib/questions/admin-filters';
import styles from './admin.module.css';

type CategoryCount = { id: string; name: string; count: number };

export function QuestionBankFilters({
  categories,
  filters,
  totalCount,
  uncategorizedCount,
}: {
  categories: CategoryCount[];
  filters: ActiveFilters;
  totalCount: number;
  uncategorizedCount: number;
}) {
  const sortedCategories = [...categories].sort(
    (left, right) => right.count - left.count || left.name.localeCompare(right.name, 'ar'),
  );
  const primaryCategories = sortedCategories.slice(0, 8);
  const otherCategories = sortedCategories.slice(8);
  const categoryLinks = [
    { id: 'ALL', name: 'الكل', count: totalCount },
    ...primaryCategories,
    { id: 'UNCATEGORIZED', name: 'بدون تصنيف', count: uncategorizedCount },
  ];

  return (
    <div className={styles.questionBankTools}>
      <nav className={styles.categoryRail} aria-label="تصنيفات بنك الأسئلة">
        {categoryLinks.map((category) => (
          <Link
            key={category.id}
            href={buildQuestionBankHref(filters, { category: category.id, page: 1 })}
            aria-current={filters.category === category.id ? 'page' : undefined}
            aria-label={`${category.name} ${formatNumber(category.count)}`}
          >
            <span>{category.name}</span>
            <strong>{formatNumber(category.count)}</strong>
          </Link>
        ))}
      </nav>
      {otherCategories.length > 0 && (
        <details
          className={styles.otherCategories}
          open={otherCategories.some((category) => category.id === filters.category)}
        >
          <summary>
            أقسام أخرى
            <strong>{formatNumber(otherCategories.length)}</strong>
          </summary>
          <nav className={styles.categoryRail} aria-label="أقسام أخرى في بنك الأسئلة">
            {otherCategories.map((category) => (
              <Link
                key={category.id}
                href={buildQuestionBankHref(filters, { category: category.id, page: 1 })}
                aria-current={filters.category === category.id ? 'page' : undefined}
                aria-label={`${category.name} ${formatNumber(category.count)}`}
              >
                <span>{category.name}</span>
                <strong>{formatNumber(category.count)}</strong>
              </Link>
            ))}
          </nav>
        </details>
      )}

      <form className={styles.questionFilters} action="/admin/content" role="search">
        {filters.category !== 'ALL' && (
          <input type="hidden" name="category" value={filters.category} />
        )}
        <label className={styles.questionSearch}>
          <span>بحث في الأسئلة</span>
          <span className={styles.searchControl}>
            <Search aria-hidden="true" />
            <input
              type="search"
              name="q"
              defaultValue={filters.q}
              maxLength={200}
              placeholder="اكتب كلمات من السؤال"
            />
          </span>
        </label>
        <label>
          <span>الحالة</span>
          <select name="status" defaultValue={filters.status}>
            <option value="ALL">الكل</option>
            <option value="PUBLISHED">منشور</option>
            <option value="DRAFT">مسودة</option>
          </select>
        </label>
        <label>
          <span>الصعوبة</span>
          <select name="difficulty" defaultValue={filters.difficulty}>
            <option value="ALL">الكل</option>
            <option value="EASY">سهل</option>
            <option value="MEDIUM">متوسط</option>
            <option value="HARD">صعب</option>
          </select>
        </label>
        <label>
          <span>اللعبة</span>
          <select name="game" defaultValue={filters.game}>
            <option value="ALL">الكل</option>
            <option value="QUIZ">المسابقات</option>
            <option value="LADDER">لعبة السلم</option>
            <option value="CATEGORY_BOARD">لوحة الفئات</option>
            <option value="LETTER_CHALLENGE">تحدي الحروف</option>
            <option value="MILLIONAIRE">من سيربح المليون</option>
          </select>
        </label>
        <Button type="submit">تطبيق</Button>
      </form>

      {/* Published-only random pull into the quiz-builder draft. */}
      <div className={styles.quickFetchRow}>
        <FetchBankQuestionsButton
          filters={{
            category: filters.category,
            q: filters.q,
            difficulty: filters.difficulty,
            game: filters.game,
            time: filters.time,
            includeDescendants: filters.includeDescendants,
          }}
        />
      </div>
    </div>
  );
}

'use client';
import { formatNumber } from '@/lib/utils';

import { Search, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';
import {
  QUESTION_DIFFICULTIES,
  QUESTION_GAMES,
  QUESTION_STATUSES,
  QUESTION_TIME_BUCKETS,
  QUESTION_TYPES,
  TIME_BUCKET_LABELS,
  TYPE_LABELS,
  type QuestionDifficultyFilter,
  type QuestionGameFilter,
  type QuestionStatusFilter,
  type QuestionTimeBucket,
  type QuestionTypeFilter,
} from '@/lib/questions/admin-filters';

const DIFFICULTY_LABELS: Record<QuestionDifficultyFilter, string> = {
  ALL: 'كل المستويات',
  EASY: 'سهل',
  MEDIUM: 'متوسط',
  HARD: 'صعب',
};

const STATUS_LABELS: Record<QuestionStatusFilter, string> = {
  ALL: 'كل الحالات',
  DRAFT: 'مسودة',
  PUBLISHED: 'منشور',
  ARCHIVED: 'مؤرشف',
};

const GAME_LABELS: Record<QuestionGameFilter, string> = {
  ALL: 'كل الألعاب',
  QUIZ: 'كويز عام',
  LADDER: 'لعبة السلم',
  CATEGORY_BOARD: 'لوحة الفئات',
  LETTER_CHALLENGE: 'تحدي الحروف',
  MILLIONAIRE: 'المليونير',
  QUESTION_WORD: 'كلمة وسؤال',
};

export function BankSearchBar({
  categories,
  initialKeyword,
  initialIncludeDescendants,
}: {
  categories: Array<{ id: string; name: string; depth: number; questionCount: number }>;
  initialKeyword: string;
  initialIncludeDescendants: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [keyword, setKeyword] = useState(initialKeyword);

  const update = useCallback(
    (overrides: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(overrides)) {
        if (value === null || value === '' || value === 'ALL' || value === 'ANY') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      // Reset pagination when filters change.
      if (Object.keys(overrides).some((k) => k !== 'page')) {
        params.delete('page');
      }
      const next = params.toString();
      startTransition(() => router.push(next ? `/admin/content?${next}` : '/admin/content'));
    },
    [router, searchParams],
  );

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    update({
      q: String(form.get('q') ?? '').trim(),
      keyword,
    });
  };

  const categoryValue = searchParams.get('category') ?? 'ALL';
  const statusValue = (searchParams.get('status') as QuestionStatusFilter) ?? 'ALL';
  const difficultyValue = (searchParams.get('difficulty') as QuestionDifficultyFilter) ?? 'ALL';
  const typeValue = (searchParams.get('type') as QuestionTypeFilter) ?? 'ALL';
  const gameValue = (searchParams.get('game') as QuestionGameFilter) ?? 'ALL';
  const timeValue = (searchParams.get('time') as QuestionTimeBucket) ?? 'ANY';

  const hasFilters =
    categoryValue !== 'ALL' ||
    statusValue !== 'ALL' ||
    difficultyValue !== 'ALL' ||
    typeValue !== 'ALL' ||
    gameValue !== 'ALL' ||
    timeValue !== 'ANY' ||
    Boolean(searchParams.get('q')) ||
    Boolean(keyword) ||
    initialIncludeDescendants;

  const clearAll = () => {
    setKeyword('');
    startTransition(() => router.push('/admin/content'));
  };

  return (
    <form className="bank-search-bar" onSubmit={onSubmit} aria-label="بحث بنك الأسئلة">
      <label className="bank-search-bar-field">
        <Search aria-hidden />
        <input
          type="search"
          name="q"
          placeholder="ابحث في نص السؤال..."
          defaultValue={searchParams.get('q') ?? ''}
        />
      </label>
      <label className="bank-search-bar-field">
        <span className="bank-search-bar-label">الكلمة المفتاحية</span>
        <input
          type="search"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="مثال: السعودية"
          maxLength={60}
        />
      </label>
      <label className="bank-search-bar-field">
        <span className="bank-search-bar-label">التصنيف</span>
        <select
          name="category"
          defaultValue={categoryValue}
          onChange={(event) => update({ category: event.currentTarget.value })}
        >
          <option value="ALL">كل التصنيفات</option>
          <option value="UNCATEGORIZED">— بدون تصنيف —</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {'— '.repeat(category.depth)}
              {category.name} ({formatNumber(category.questionCount)})
            </option>
          ))}
        </select>
      </label>
      <label className="bank-search-bar-field">
        <span className="bank-search-bar-label">الحالة</span>
        <select
          name="status"
          defaultValue={statusValue}
          onChange={(event) => update({ status: event.currentTarget.value })}
        >
          {QUESTION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </label>
      <label className="bank-search-bar-field">
        <span className="bank-search-bar-label">المستوى</span>
        <select
          name="difficulty"
          defaultValue={difficultyValue}
          onChange={(event) => update({ difficulty: event.currentTarget.value })}
        >
          {QUESTION_DIFFICULTIES.map((difficulty) => (
            <option key={difficulty} value={difficulty}>
              {DIFFICULTY_LABELS[difficulty]}
            </option>
          ))}
        </select>
      </label>
      <label className="bank-search-bar-field">
        <span className="bank-search-bar-label">النوع</span>
        <select
          name="type"
          defaultValue={typeValue}
          onChange={(event) => update({ type: event.currentTarget.value })}
        >
          {QUESTION_TYPES.map((type) => (
            <option key={type} value={type}>
              {TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </label>
      <label className="bank-search-bar-field">
        <span className="bank-search-bar-label">اللعبة</span>
        <select
          name="game"
          defaultValue={gameValue}
          onChange={(event) => update({ game: event.currentTarget.value })}
        >
          {QUESTION_GAMES.map((game) => (
            <option key={game} value={game}>
              {GAME_LABELS[game]}
            </option>
          ))}
        </select>
      </label>
      <label className="bank-search-bar-field">
        <span className="bank-search-bar-label">الوقت</span>
        <select
          name="time"
          defaultValue={timeValue}
          onChange={(event) => update({ time: event.currentTarget.value })}
        >
          {QUESTION_TIME_BUCKETS.map((bucket) => (
            <option key={bucket} value={bucket}>
              {TIME_BUCKET_LABELS[bucket]}
            </option>
          ))}
        </select>
      </label>
      <div className="bank-search-bar-actions">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          تطبيق
        </button>
        {hasFilters && (
          <button type="button" className="btn btn-ghost" onClick={clearAll} disabled={pending}>
            <X aria-hidden /> مسح
          </button>
        )}
      </div>
    </form>
  );
}

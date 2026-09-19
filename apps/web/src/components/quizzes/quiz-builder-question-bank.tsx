'use client';

import type {
  QuizBuilderQuestionPageInput,
  QuizBuilderRandomSelectionInput,
} from '@tahaddi/contracts';
import { ListPlus, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { QuestionComposer } from '@/components/questions/question-composer';
import { QuestionEditor } from '@/components/questions/question-editor';
import { Button, Input, NumberInput, Select } from '@/components/ui';
import { formatNumber } from '@/lib/utils';
import type {
  AvailableBankQuestion,
  QuizBuilderGameMode,
  QuizBuilderQuestionPage,
  QuizBuilderRandomSelectionResult,
} from '@/lib/quizzes/quiz-draft';
import styles from './quiz-builder.module.css';

type QuestionPageLoader = (input: QuizBuilderQuestionPageInput) => Promise<QuizBuilderQuestionPage>;
type RandomQuestionLoader = (
  input: QuizBuilderRandomSelectionInput,
) => Promise<QuizBuilderRandomSelectionResult>;

const difficultyLabel = { EASY: 'سهل', MEDIUM: 'متوسط', HARD: 'صعب' } as const;

export function QuizBuilderQuestionBank({
  initialBank,
  gameMode,
  selectedIds,
  canAddQuestions,
  loadQuestionPage,
  pickRandomQuestions,
  onAdd,
  onAddMany,
}: {
  initialBank: QuizBuilderQuestionPage;
  gameMode: QuizBuilderGameMode;
  selectedIds: ReadonlySet<string>;
  canAddQuestions: boolean;
  loadQuestionPage?: QuestionPageLoader;
  pickRandomQuestions?: RandomQuestionLoader;
  onAdd: (question: AvailableBankQuestion) => void;
  onAddMany: (questions: AvailableBankQuestion[]) => void;
}) {
  const [bank, setBank] = useState(initialBank);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [difficulty, setDifficulty] = useState<'ALL' | 'EASY' | 'MEDIUM' | 'HARD'>('ALL');
  const [page, setPage] = useState(1);
  const [hideSelected, setHideSelected] = useState(true);
  const [loading, setLoading] = useState(false);
  const [randomCounts, setRandomCounts] = useState({ EASY: 2, MEDIUM: 2, HARD: 2 });
  const [randomNotice, setRandomNotice] = useState('');
  const firstRequest = useRef(true);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    if (!loadQuestionPage) return;
    if (firstRequest.current) {
      firstRequest.current = false;
      return;
    }
    let active = true;
    setLoading(true);
    void loadQuestionPage({ query: debouncedQuery, categoryId, difficulty, gameMode, page })
      .then((result) => {
        if (active) setBank(result);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [categoryId, debouncedQuery, difficulty, gameMode, loadQuestionPage, page]);

  const visibleQuestions = useMemo(() => {
    const sourceQuestions = bank.status === 'success' ? bank.questions : [];
    if (loadQuestionPage) {
      return hideSelected
        ? sourceQuestions.filter((question) => !selectedIds.has(question.id))
        : sourceQuestions;
    }
    const normalizedQuery = debouncedQuery.toLocaleLowerCase('ar');
    return sourceQuestions.filter((question) => {
      const matchesMode = !question.gameTypes?.length || question.gameTypes.includes(gameMode);
      const matchesQuery =
        !normalizedQuery ||
        `${question.prompt} ${question.category}`.toLocaleLowerCase('ar').includes(normalizedQuery);
      const matchesCategory = !categoryId || question.category === categoryId;
      const matchesDifficulty = difficulty === 'ALL' || question.difficulty === difficulty;
      const matchesSelected = !hideSelected || !selectedIds.has(question.id);
      return matchesMode && matchesQuery && matchesCategory && matchesDifficulty && matchesSelected;
    });
  }, [
    bank,
    categoryId,
    debouncedQuery,
    difficulty,
    gameMode,
    hideSelected,
    loadQuestionPage,
    selectedIds,
  ]);
  const categories = bank.status === 'success' ? bank.categories : [];
  const total = loadQuestionPage
    ? bank.status === 'success'
      ? bank.total
      : 0
    : visibleQuestions.length;
  const pageCount = bank.status === 'success' ? bank.pageCount : 1;

  const resetPage = () => setPage(1);

  return (
    <section aria-labelledby="quiz-question-bank-heading">
      <div className={styles.sectionHeading}>
        <div>
          <h3 id="quiz-question-bank-heading">بنك الأسئلة</h3>
          <p className="muted">نتائج خادمية، 40 سؤالًا في الصفحة.</p>
        </div>
      </div>

      {canAddQuestions ? (
        <QuestionComposer defaultOpen={false}>
          <QuestionEditor categories={categories} />
        </QuestionComposer>
      ) : null}

      <div className={styles.filters}>
        <Input
          type="search"
          label="ابحث في بنك الأسئلة"
          placeholder="نص السؤال أو التصنيف"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            resetPage();
          }}
        />
        <Select
          label="التصنيف"
          value={categoryId}
          onChange={(event) => {
            setCategoryId(event.target.value);
            resetPage();
          }}
        >
          <option value="">كل التصنيفات</option>
          {categories.map((category) => (
            <option key={category.id} value={loadQuestionPage ? category.id : category.name}>
              {category.name}
            </option>
          ))}
        </Select>
        <Select
          label="الصعوبة"
          value={difficulty}
          onChange={(event) => {
            setDifficulty(event.target.value as typeof difficulty);
            resetPage();
          }}
        >
          <option value="ALL">كل المستويات</option>
          <option value="EASY">سهل</option>
          <option value="MEDIUM">متوسط</option>
          <option value="HARD">صعب</option>
        </Select>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={hideSelected}
            onChange={(event) => setHideSelected(event.target.checked)}
          />
          إخفاء الأسئلة المضافة
        </label>
      </div>

      {pickRandomQuestions ? (
        <fieldset className={styles.randomPicker}>
          <legend>سحب عشوائي بتوزيع الصعوبة</legend>
          <div className={styles.filters}>
            {(['EASY', 'MEDIUM', 'HARD'] as const).map((level) => (
              <NumberInput
                key={level}
                label={`عدد ${difficultyLabel[level]}`}
                min="0"
                max="100"
                value={randomCounts[level]}
                onChange={(event) =>
                  setRandomCounts((current) => ({
                    ...current,
                    [level]: Math.min(100, Math.max(0, Number(event.target.value) || 0)),
                  }))
                }
              />
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={loading || Object.values(randomCounts).every((count) => count === 0)}
              onClick={() => {
                setLoading(true);
                setRandomNotice('');
                void pickRandomQuestions({
                  query: debouncedQuery,
                  categoryId,
                  gameMode,
                  counts: randomCounts,
                })
                  .then((result) => {
                    if (result.status === 'error') {
                      setRandomNotice(result.message);
                      return;
                    }
                    onAddMany(result.questions);
                    setRandomNotice(
                      `سُحب ${formatNumber(result.questions.length)} سؤالًا من كامل النتائج.`,
                    );
                  })
                  .finally(() => setLoading(false));
              }}
            >
              سحب وإضافة
            </Button>
          </div>
          {randomNotice ? (
            <p className="muted" role="status">
              {randomNotice}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      <div
        className={styles.bankMeta}
        role="status"
        aria-label={loading ? 'جارٍ تحميل الأسئلة…' : `${formatNumber(total)} سؤالًا مطابقًا`}
      >
        <span>
          <Search aria-hidden="true" />
          {loading ? 'جارٍ تحميل الأسئلة…' : `${formatNumber(total)} سؤالًا مطابقًا`}
        </span>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={visibleQuestions.length === 0}
          onClick={() => onAddMany(visibleQuestions)}
        >
          <ListPlus aria-hidden="true" />
          إضافة الصفحة
        </Button>
      </div>

      {bank.status === 'error' ? (
        <p className="text-danger" role="alert">
          {bank.message}
        </p>
      ) : visibleQuestions.length === 0 && !loading ? (
        <p className="muted">لا توجد أسئلة مطابقة. غيّر البحث أو التصفية.</p>
      ) : (
        <div className={styles.bankList} aria-busy={loading}>
          {visibleQuestions.map((question) => {
            const isAdded = selectedIds.has(question.id);
            return (
              <article key={question.id} className={styles.bankItem}>
                <div>
                  <strong>{question.prompt}</strong>
                  <p className="muted">
                    {question.category || 'عام'} · {formatNumber(question.duration)} ث ·{' '}
                    {formatNumber(question.points)} نقطة
                    {question.difficulty ? ` · ${difficultyLabel[question.difficulty]}` : ''}
                    {question.status === 'DRAFT' ? ' · مسودة' : ''}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={isAdded ? 'outline' : 'secondary'}
                  disabled={isAdded}
                  onClick={() => onAdd(question)}
                >
                  {isAdded ? 'مضاف' : 'إضافة'}
                </Button>
              </article>
            );
          })}
        </div>
      )}

      {loadQuestionPage && pageCount > 1 ? (
        <nav className={styles.pagination} aria-label="صفحات بنك الأسئلة">
          <Button
            type="button"
            variant="outline"
            disabled={page <= 1 || loading}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            الصفحة السابقة
          </Button>
          <span>
            صفحة {formatNumber(page)} من {formatNumber(pageCount)}
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={page >= pageCount || loading}
            onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
          >
            الصفحة التالية
          </Button>
        </nav>
      ) : null}
    </section>
  );
}

export type { QuestionPageLoader, RandomQuestionLoader };

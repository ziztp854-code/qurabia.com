'use client';

import type {
  QuizBuilderQuestionPageInput,
  QuizBuilderRandomSelectionInput,
} from '@tahaddi/contracts';
import { ListPlus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { QuestionComposer } from '@/components/questions/question-composer';
import { QuestionEditor } from '@/components/questions/question-editor';
import { Badge } from '@/components/ui';
import { Button, Input, NumberInput, Select } from '@/components/ui';
import { formatNumber } from '@/lib/utils';
import type {
  AvailableBankQuestion,
  QuizBuilderGameMode,
  QuizBuilderQuestionPage,
  QuizBuilderRandomSelectionResult,
} from '@/lib/quizzes/quiz-draft';
import styles from './quiz-builder.module.css';
import { questionSupportsGameMode } from '@/lib/quizzes/quiz-draft';

type QuestionPageLoader = (input: QuizBuilderQuestionPageInput) => Promise<QuizBuilderQuestionPage>;
type RandomQuestionLoader = (
  input: QuizBuilderRandomSelectionInput,
) => Promise<QuizBuilderRandomSelectionResult>;

const difficultyLabel = { EASY: 'سهل', MEDIUM: 'متوسط', HARD: 'صعب' } as const;
const difficultyBadge = {
  EASY: 'badge-success',
  MEDIUM: 'badge-gold',
  HARD: 'badge-live',
} as const;

export function QuizBuilderQuestionBank({
  initialBank,
  gameMode,
  selectedIds,
  canAddQuestions,
  loadQuestionPage,
  pickRandomQuestions,
  pickAiQuestions,
  onAdd,
  onAddMany,
  onRemove,
}: {
  initialBank: QuizBuilderQuestionPage;
  gameMode: QuizBuilderGameMode;
  selectedIds: ReadonlySet<string>;
  canAddQuestions: boolean;
  loadQuestionPage?: QuestionPageLoader;
  pickRandomQuestions?: RandomQuestionLoader;
  pickAiQuestions?: RandomQuestionLoader;
  onAdd: (question: AvailableBankQuestion) => void;
  onAddMany: (questions: AvailableBankQuestion[]) => void;
  onRemove?: (id: string) => void;
}) {
  const [bank, setBank] = useState(initialBank);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [difficulty, setDifficulty] = useState<'ALL' | 'EASY' | 'MEDIUM' | 'HARD'>('ALL');
  const [page, setPage] = useState(1);
  const [hideSelected, setHideSelected] = useState(true);
  const [loading, setLoading] = useState(Boolean(loadQuestionPage));
  const [randomCounts, setRandomCounts] = useState({ EASY: 2, MEDIUM: 2, HARD: 2 });
  const [randomNotice, setRandomNotice] = useState('');
  const [activePick, setActivePick] = useState<'random' | 'assistant' | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    if (!loadQuestionPage) return;
    let active = true;
    void Promise.resolve()
      .then(() => {
        if (!active) return;
        setLoading(true);
        return loadQuestionPage({ query: debouncedQuery, categoryId, difficulty, gameMode, page });
      })
      .then((result) => {
        if (active && result) setBank(result);
      })
      .catch(() => {
        if (active) setBank({ status: 'error', message: 'تعذّر تحميل الأسئلة. أعد المحاولة.' });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [categoryId, debouncedQuery, difficulty, gameMode, loadQuestionPage, page]);

  const visibleQuestions = useMemo(() => {
    const sourceQuestions =
      bank.status === 'success'
        ? bank.questions.filter((question) => questionSupportsGameMode(question, gameMode))
        : [];
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

  const runPick = (
    counts: { EASY: number; MEDIUM: number; HARD: number },
    diverse = false,
    useAssistant = false,
  ) => {
    const loader = useAssistant ? pickAiQuestions : pickRandomQuestions;
    if (!loader || activePick) return;
    const remaining = Math.max(0, 100 - selectedIds.size);
    if (Object.values(counts).reduce((sum, count) => sum + count, 0) > remaining) {
      setRandomNotice(`يمكن إضافة ${formatNumber(remaining)} سؤالًا فقط. قلّل أعداد السحب.`);
      return;
    }
    setLoading(true);
    setActivePick(useAssistant ? 'assistant' : 'random');
    setRandomNotice('');
    void loader({
      query: useAssistant ? '' : debouncedQuery,
      categoryId: useAssistant ? '' : categoryId,
      gameMode,
      counts,
      excludeIds: [...selectedIds],
      ...(diverse ? { preset: 'DIVERSE_20' as const } : {}),
    })
      .then((result) => {
        if (result.status === 'error') {
          setRandomNotice(result.message);
          return;
        }
        onAddMany(result.questions);
        if (useAssistant) {
          const count = formatNumber(result.questions.length);
          const shortfall =
            result.questions.length < 20
              ? ' لم تتوفر أسئلة منشورة كافية لتحقيق توزيع 7 سهلة و7 متوسطة و6 صعبة.'
              : '';
          setRandomNotice(
            result.selectionSource === 'openclaw'
              ? `اختار المساعد ${count} سؤالًا من الأسئلة المنشورة. راجع الأسئلة قبل النشر.${shortfall}`
              : `استُخدم الاختيار العادي بدل اختيار المساعد، وأُضيف ${count} سؤالًا. راجع الأسئلة قبل النشر.${shortfall}`,
          );
          return;
        }
        setRandomNotice(
          diverse && result.questions.length < 20
            ? `أُضيف ${formatNumber(result.questions.length)} سؤالًا. لم تتوفر أسئلة منشورة كافية لتحقيق توزيع 7 سهلة و7 متوسطة و6 صعبة.`
            : `سُحب ${formatNumber(result.questions.length)} سؤالًا من كامل النتائج.`,
        );
      })
      .catch(() =>
        setRandomNotice(
          useAssistant
            ? 'تعذّر اختيار الأسئلة بالمساعد. أعد المحاولة.'
            : 'تعذّر سحب الأسئلة. أعد المحاولة.',
        ),
      )
      .finally(() => {
        setLoading(false);
        setActivePick(null);
      });
  };

  return (
    <section aria-labelledby="quiz-question-bank-heading">
      <div className={styles.sectionHeading}>
        <div>
          <h3 id="quiz-question-bank-heading">بنك الأسئلة</h3>
          <p className="muted">اختر الأسئلة المتوافقة مع وضع اللعب، أو أضف الصفحة دفعة واحدة.</p>
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

      {pickRandomQuestions || pickAiQuestions ? (
        <fieldset className={styles.randomPicker}>
          <legend>اختيار الأسئلة بتوزيع الصعوبة</legend>
          <div className={styles.filters}>
            {pickRandomQuestions
              ? (['EASY', 'MEDIUM', 'HARD'] as const).map((level) => (
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
                ))
              : null}
            {pickRandomQuestions ? (
              <Button
                type="button"
                variant="outline"
                disabled={loading || activePick !== null}
                onClick={() => runPick({ EASY: 7, MEDIUM: 7, HARD: 6 }, true)}
              >
                جلب 20 سؤالًا
              </Button>
            ) : null}
            {pickRandomQuestions ? (
              <Button
                type="button"
                variant="outline"
                disabled={
                  loading ||
                  activePick !== null ||
                  Object.values(randomCounts).every((count) => count === 0)
                }
                onClick={() => runPick(randomCounts)}
              >
                سحب وإضافة
              </Button>
            ) : null}
            {pickAiQuestions ? (
              <Button
                type="button"
                variant="gold"
                disabled={loading || activePick !== null}
                loading={activePick === 'assistant'}
                onClick={() => runPick({ EASY: 7, MEDIUM: 7, HARD: 6 }, true, true)}
              >
                اختيار بالمساعد
              </Button>
            ) : null}
          </div>
          {pickRandomQuestions ? (
            <p className="muted">
              جلب 20 سؤالًا منشورًا يوزّعها بين الفئات مع 7 سهلة و7 متوسطة و6 صعبة عند توفرها،
              بصرف النظر عن فلاتر البحث. سهل: 500، متوسط: 700، صعب: 1000 نقطة.
            </p>
          ) : null}
          {pickAiQuestions ? (
            <p className="muted">
              يختار المساعد من الأسئلة المنشورة فقط، ويوزّع 20 سؤالًا بين المستويات والفئات عند
              توفرها. راجع اختياره قبل النشر. إذا تعذّر الاتصال به، يستخدم الموقع الاختيار العادي.
            </p>
          ) : null}
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
          disabled={
            loading ||
            selectedIds.size >= 100 ||
            visibleQuestions.every((question) => selectedIds.has(question.id))
          }
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
              <article
                key={question.id}
                className={styles.bankItem}
                data-difficulty={question.difficulty || undefined}
                data-added={isAdded || undefined}
              >
                <div>
                  {question.difficulty || question.status === 'DRAFT' ? (
                    <div className={styles.bankItemMeta}>
                      {question.difficulty ? (
                        <Badge className={difficultyBadge[question.difficulty] ?? undefined}>
                          {difficultyLabel[question.difficulty]}
                        </Badge>
                      ) : null}
                      {question.status === 'DRAFT' ? <Badge>مسودة</Badge> : null}
                    </div>
                  ) : null}
                  <strong>{question.prompt}</strong>
                  <p className="muted">
                    {question.category || 'عام'} · {formatNumber(question.duration)} ث ·{' '}
                    {formatNumber(question.points)} نقطة
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={isAdded ? 'outline' : 'secondary'}
                  disabled={loading || (isAdded ? !onRemove : selectedIds.size >= 100)}
                  aria-pressed={isAdded}
                  onClick={() => (isAdded ? onRemove?.(question.id) : onAdd(question))}
                >
                  {isAdded ? 'إلغاء الاختيار' : 'إضافة'}
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

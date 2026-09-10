'use client';

import { quizBuilderSchema } from '@tahaddi/contracts';
import { ArrowDown, ArrowUp, CheckCircle2, ClipboardList, Save, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  createQuiz,
  listQuizBuilderQuestions,
  pickRandomQuizBuilderQuestions,
} from '@/app/quizzes/actions';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  Input,
  NumberInput,
  Select,
  Stepper,
  Switch,
  Textarea,
} from '@/components/ui';
import { formatNumber } from '@/lib/utils';
import {
  createEmptyQuizDraft,
  parseQuizDraft,
  QUIZ_BUILDER_GAME_MODES,
  QUIZ_BUILDER_GAME_MODE_LABELS,
  QUIZ_DRAFT_STORAGE_KEY,
  type AvailableBankQuestion,
  type QuizBuilderGameMode,
  type QuizBuilderQuestionPage,
  type QuizDraft,
  type QuizDraftQuestion,
} from '@/lib/quizzes/quiz-draft';
import { playHrefForPack } from '@/lib/questions/feed/types';
import {
  QuizBuilderQuestionBank,
  type QuestionPageLoader,
  type RandomQuestionLoader,
} from './quiz-builder-question-bank';
import styles from './quiz-builder.module.css';

const STEPS = ['البيانات', 'الأسئلة', 'الإعدادات', 'المعاينة', 'النشر'];
const STEP_NEXT_LABELS = ['اختيار الأسئلة', 'الإعدادات', 'المعاينة', 'النشر'] as const;
const storageKey = QUIZ_DRAFT_STORAGE_KEY;
const MODE_DESCRIPTIONS: Record<QuizBuilderGameMode, string> = {
  QUIZ: 'أسئلة مباشرة يديرها المضيف مع نقاط وترتيب للاعبين.',
  LADDER: 'تقدّم على السلم بإجاباتك الصحيحة.',
  CATEGORY_BOARD: 'منافسة بين فريقين عبر فئات وأسئلة متنوعة.',
  LETTER_CHALLENGE: 'امتلك الحروف بالإجابات الصحيحة وابنِ طريق الفوز.',
  MILLIONAIRE: 'أسئلة متدرجة مع وسائل مساعدة ومحطات أمان.',
};

function createLocalBank(questions: AvailableBankQuestion[]): QuizBuilderQuestionPage {
  const categories = Array.from(
    new Set(questions.map((question) => question.category).filter(Boolean)),
  )
    .sort((a, b) => a.localeCompare(b, 'ar'))
    .map((name) => ({ id: name, name }));
  return {
    status: 'success',
    questions,
    categories,
    page: 1,
    pageCount: 1,
    total: questions.length,
  };
}

export { parseQuizDraft };

export function QuizBuilder({
  initialBank,
  availableQuestions = [],
  canAddQuestions = false,
  loadQuestionPage,
  pickRandomQuestions,
}: {
  initialBank?: QuizBuilderQuestionPage;
  availableQuestions?: AvailableBankQuestion[];
  canAddQuestions?: boolean;
  loadQuestionPage?: QuestionPageLoader;
  pickRandomQuestions?: RandomQuestionLoader;
}) {
  const [draft, setDraft] = useState<QuizDraft>(createEmptyQuizDraft);
  const [currentStep, setCurrentStep] = useState(0);
  const [storageReady, setStorageReady] = useState(false);
  const [notice, setNotice] = useState('');
  const [saveFailed, setSaveFailed] = useState(false);
  const [savingQuiz, setSavingQuiz] = useState(false);
  const [savedRoomCode, setSavedRoomCode] = useState('');
  const [savedQuizId, setSavedQuizId] = useState('');
  const [savedGameMode, setSavedGameMode] = useState<QuizBuilderGameMode | null>(null);
  const [batchDuration, setBatchDuration] = useState(20);
  const [batchPoints, setBatchPoints] = useState(1_000);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const storedDraft = parseQuizDraft(localStorage.getItem(storageKey) || '');
      if (storedDraft) {
        setDraft(storedDraft);
        setNotice('استُعيدت المسودة المحلية المحفوظة.');
      }
      setStorageReady(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    const timeout = window.setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(draft));
        setSaveFailed(false);
      } catch {
        setSaveFailed(true);
      }
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [draft, storageReady]);

  const bank = useMemo(
    () => initialBank ?? createLocalBank(availableQuestions),
    [availableQuestions, initialBank],
  );
  const effectiveLoader = initialBank
    ? (loadQuestionPage ?? listQuizBuilderQuestions)
    : loadQuestionPage;
  const effectiveRandomPicker = initialBank
    ? (pickRandomQuestions ?? pickRandomQuizBuilderQuestions)
    : pickRandomQuestions;
  const selectedIds = useMemo(
    () => new Set(draft.questions.map((question) => question.id)),
    [draft.questions],
  );
  const totalDuration = draft.questions.reduce((sum, question) => sum + question.duration, 0);
  const totalPoints = draft.questions.reduce((sum, question) => sum + question.points, 0);
  const quizValidation = useMemo(() => quizBuilderSchema.safeParse(draft), [draft]);
  const validationReason = quizValidation.success
    ? ''
    : (quizValidation.error.issues[0]?.message ?? 'أكمل بيانات المسابقة قبل النشر.');
  const fieldErrors = quizValidation.success ? {} : quizValidation.error.flatten().fieldErrors;

  const updateDraft = <Key extends keyof QuizDraft>(key: Key, value: QuizDraft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const addQuestions = (questions: AvailableBankQuestion[]) => {
    const fresh = questions
      .filter((question) => !selectedIds.has(question.id))
      .slice(0, Math.max(0, 100 - draft.questions.length))
      .map<QuizDraftQuestion>((question) => ({
        id: question.id,
        prompt: question.prompt,
        category: question.category,
        duration: question.duration,
        points: question.points,
        questionVersion: question.questionVersion,
      }));
    if (fresh.length === 0) {
      setNotice(
        draft.questions.length >= 100
          ? 'بلغت المسودة حد 100 سؤال. احذف بعض الأسئلة أو انشر المسابقة لبدء مسودة جديدة.'
          : 'الأسئلة المُجلَبة مضافة مسبقًا في المسودة الحالية.',
      );
      return;
    }
    updateDraft('questions', [...draft.questions, ...fresh]);
    const skipped = questions.length - fresh.length;
    setNotice(
      skipped > 0
        ? `أُضيف ${formatNumber(fresh.length)} سؤالًا، وتجاهل ${formatNumber(skipped)} سؤالًا مكررًا.`
        : `أُضيف ${formatNumber(fresh.length)} سؤالًا إلى المسودة.`,
    );
  };

  const updateQuestion = (id: string, field: 'duration' | 'points', value: number) => {
    updateDraft(
      'questions',
      draft.questions.map((question) =>
        question.id === id ? { ...question, [field]: value } : question,
      ),
    );
  };

  const moveQuestion = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= draft.questions.length) return;
    const questions = [...draft.questions];
    [questions[index], questions[nextIndex]] = [questions[nextIndex], questions[index]];
    updateDraft('questions', questions);
  };

  const saveDraft = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
      setSaveFailed(false);
      setNotice('حُفظت المسودة محليًا على هذا الجهاز.');
    } catch {
      setSaveFailed(true);
      setNotice('تعذّر حفظ المسودة محليًا. تحقق من مساحة التخزين في المتصفح.');
    }
  };

  const saveQuiz = async () => {
    if (savingQuiz || !quizValidation.success) return;
    setSavingQuiz(true);
    setSavedRoomCode('');
    setSavedQuizId('');
    try {
      const result = await createQuiz(quizValidation.data);
      if (result.status === 'error') {
        setSaveFailed(true);
        setNotice(result.message);
        return;
      }
      setSaveFailed(false);
      setSavedRoomCode(result.roomCode);
      setSavedQuizId(result.quizId);
      setSavedGameMode(draft.gameMode);
      setDraft(createEmptyQuizDraft());
      setNotice(`نُشرت المسابقة. رمز الغرفة: ${result.roomCode}`);
    } catch {
      setSaveFailed(true);
      setNotice('تعذّر نشر المسابقة الآن. حاول مرة أخرى.');
    } finally {
      setSavingQuiz(false);
    }
  };

  const selectedQuestions =
    draft.questions.length === 0 ? (
      <p className="muted">لم تختر أسئلة بعد.</p>
    ) : (
      <ol className={styles.selectedList}>
        {draft.questions.map((question, index) => (
          <li key={question.id} className={styles.selectedItem}>
            <div>
              <strong>
                {formatNumber(index + 1)}. {question.prompt}
              </strong>
              <p className="muted">{question.category || 'عام'}</p>
              <div className={styles.questionSettings}>
                <NumberInput
                  label="الوقت (ثوانٍ)"
                  min="5"
                  max="300"
                  value={question.duration}
                  onChange={(event) =>
                    updateQuestion(question.id, 'duration', Number(event.target.value) || 5)
                  }
                />
                <NumberInput
                  label="النقاط"
                  min="100"
                  max="10000"
                  value={question.points}
                  onChange={(event) =>
                    updateQuestion(question.id, 'points', Number(event.target.value) || 100)
                  }
                />
              </div>
            </div>
            <div className={styles.rowActions}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`نقل السؤال ${formatNumber(index + 1)} لأعلى`}
                disabled={index === 0}
                onClick={() => moveQuestion(index, -1)}
              >
                <ArrowUp aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`نقل السؤال ${formatNumber(index + 1)} لأسفل`}
                disabled={index === draft.questions.length - 1}
                onClick={() => moveQuestion(index, 1)}
              >
                <ArrowDown aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`إزالة السؤال ${formatNumber(index + 1)}`}
                onClick={() =>
                  updateDraft(
                    'questions',
                    draft.questions.filter((item) => item.id !== question.id),
                  )
                }
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          </li>
        ))}
      </ol>
    );

  return (
    <div className={`quiz-builder ${styles.shell}`} dir="rtl">
      <Card className="quiz-builder-intro">
        <div className="inline-between">
          <div>
            <h2>
              <ClipboardList aria-hidden="true" /> منشئ المسابقة
            </h2>
            <p className="muted">خمس خطوات واضحة، ومسودة تلقائية لا تفقد مدخلاتك.</p>
          </div>
          <Badge>{savedRoomCode ? `رمز ${savedRoomCode}` : 'حفظ تلقائي'}</Badge>
        </div>
        <Stepper steps={STEPS} current={currentStep} />
        {notice ? (
          <p className={saveFailed ? 'text-danger' : 'text-success'} role="status">
            {notice}
          </p>
        ) : null}
      </Card>

      <Card className={styles.stepPanel}>
        {currentStep === 0 ? (
          <>
            <h2>البيانات الأساسية</h2>
            <fieldset className={styles.modePicker} aria-labelledby="quiz-builder-mode-legend">
              <legend id="quiz-builder-mode-legend">وضع المسابقة</legend>
              <p className={styles.modeHint}>
                اختر طريقة اللعب لعرض الأسئلة المتوافقة معها في الخطوة التالية.
              </p>
              <div className={styles.modeOptions}>
                {QUIZ_BUILDER_GAME_MODES.map((mode) => (
                  <label key={mode} className={styles.modeOption}>
                    <input
                      type="radio"
                      name="quiz-builder-game-mode"
                      value={mode}
                      checked={draft.gameMode === mode}
                      aria-labelledby={`mode-label-${mode}`}
                      aria-describedby={`mode-description-${mode}`}
                      onChange={() => {
                        updateDraft('gameMode', mode);
                        setNotice('تغيّر وضع المسابقة. راجع توافق الأسئلة المحددة قبل النشر.');
                      }}
                    />
                    <span>
                      <strong id={`mode-label-${mode}`}>
                        {QUIZ_BUILDER_GAME_MODE_LABELS[mode]}
                      </strong>
                      <span id={`mode-description-${mode}`}>{MODE_DESCRIPTIONS[mode]}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="form-grid">
              <Input
                label="عنوان المسابقة"
                value={draft.title}
                error={fieldErrors.title?.[0]}
                onChange={(event) => updateDraft('title', event.target.value)}
              />
              <Input
                label="اسم الجولة"
                value={draft.roundName}
                error={fieldErrors.roundName?.[0]}
                onChange={(event) => updateDraft('roundName', event.target.value)}
              />
              <Textarea
                className="quiz-builder-wide"
                label="وصف مختصر"
                value={draft.description}
                error={fieldErrors.description?.[0]}
                onChange={(event) => updateDraft('description', event.target.value)}
              />
            </div>
          </>
        ) : null}

        {currentStep === 1 ? (
          <>
            <div className={styles.sectionHeading}>
              <div>
                <h2>اختيار الأسئلة</h2>
                <p className="muted">اختر من كامل البنك دون بتر النتائج بعد أول 1200 سؤال.</p>
              </div>
              <Badge>{formatNumber(draft.questions.length)} مختارة</Badge>
            </div>
            {draft.questions.length > 1 ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  updateDraft(
                    'questions',
                    [...draft.questions].sort(
                      (a, b) => a.points - b.points || a.duration - b.duration,
                    ),
                  );
                  setNotice('تم ترتيب الأسئلة تصاعديًا من الأسهل إلى الأصعب لتدرج حماسي.');
                }}
              >
                ترتيب تدرج الصعوبة
              </Button>
            ) : null}
            {selectedQuestions}
            <QuizBuilderQuestionBank
              initialBank={bank}
              gameMode={draft.gameMode}
              selectedIds={selectedIds}
              canAddQuestions={canAddQuestions}
              loadQuestionPage={effectiveLoader}
              pickRandomQuestions={effectiveRandomPicker}
              onAdd={(question) => addQuestions([question])}
              onAddMany={addQuestions}
            />
          </>
        ) : null}

        {currentStep === 2 ? (
          <>
            <h2>إعدادات الجولة</h2>
            <div className={styles.settingsGrid}>
              <Select
                label="ترتيب الأسئلة"
                value={draft.presentationMode}
                onChange={(event) =>
                  updateDraft(
                    'presentationMode',
                    event.target.value as QuizDraft['presentationMode'],
                  )
                }
              >
                <option value="SEQUENTIAL">بالترتيب المحدد</option>
                <option value="RANDOM">ترتيب عشوائي عند النشر</option>
              </Select>
              <Select
                label="مستوى الظهور"
                value={draft.visibility}
                onChange={(event) =>
                  updateDraft('visibility', event.target.value as QuizDraft['visibility'])
                }
              >
                <option value="PRIVATE">خاصة بالرابط والرمز</option>
                <option value="PUBLIC">عامة في قائمة المسابقات</option>
              </Select>
              <NumberInput
                label="حد اللاعبين"
                min="2"
                max="500"
                value={draft.playerLimit}
                onChange={(event) =>
                  updateDraft(
                    'playerLimit',
                    Math.min(500, Math.max(2, Number(event.target.value) || 2)),
                  )
                }
              />
              <div>
                <NumberInput
                  label="وقت موحد للأسئلة"
                  min="5"
                  max="300"
                  value={batchDuration}
                  onChange={(event) => setBatchDuration(Number(event.target.value) || 5)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={draft.questions.length === 0}
                  onClick={() =>
                    updateDraft(
                      'questions',
                      draft.questions.map((q) => ({ ...q, duration: batchDuration })),
                    )
                  }
                >
                  تطبيق على كل الأسئلة
                </Button>
              </div>
              <div>
                <NumberInput
                  label="نقاط موحدة للأسئلة"
                  min="100"
                  max="10000"
                  value={batchPoints}
                  onChange={(event) => setBatchPoints(Number(event.target.value) || 100)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={draft.questions.length === 0}
                  onClick={() =>
                    updateDraft(
                      'questions',
                      draft.questions.map((q) => ({ ...q, points: batchPoints })),
                    )
                  }
                >
                  تطبيق على كل الأسئلة
                </Button>
              </div>
            </div>
            <div className="settings-stack">
              <Switch
                label="تثبيت الإجابة فور اختيارها"
                checked={draft.autoLockAnswers}
                onChange={(checked) => updateDraft('autoLockAnswers', checked)}
              />
              <Switch
                label="الانتقال التلقائي بعد إجابة الجميع"
                checked={draft.autoAdvance}
                onChange={(checked) => updateDraft('autoAdvance', checked)}
              />
              <Switch
                label="احتساب سرعة الإجابة"
                checked={draft.speedScoring}
                onChange={(checked) => updateDraft('speedScoring', checked)}
              />
              <p className="muted">
                المحاولة الحالية واحدة لكل سؤال، وهو القيد الذي يفرضه محرك اللعب وقاعدة البيانات.
              </p>
            </div>
          </>
        ) : null}

        {currentStep === 3 ? (
          <>
            <h2>معاينة المسابقة</h2>
            <div className={styles.summaryGrid}>
              <div>
                <strong>{draft.title || 'بلا عنوان'}</strong>
                <span>العنوان</span>
              </div>
              <div>
                <strong>{formatNumber(draft.questions.length)}</strong>
                <span>أسئلة</span>
              </div>
              <div>
                <strong>{formatNumber(totalDuration)}</strong>
                <span>ثانية</span>
              </div>
              <div>
                <strong>{formatNumber(totalPoints)}</strong>
                <span>نقطة</span>
              </div>
            </div>
            <p>{draft.description || 'لا يوجد وصف.'}</p>
            {selectedQuestions}
          </>
        ) : null}

        {currentStep === 4 ? (
          <>
            <h2>نشر المسابقة</h2>
            <p className="muted">
              راجع الملخص ثم انشر النسخة الحالية. تُسجّل إصدارات الأسئلة للكشف عن أي تعديل لاحق.
            </p>
            {!quizValidation.success ? (
              <p id="quiz-builder-validation-reason" className="text-danger" role="alert">
                سبب تعطيل النشر: {validationReason}
              </p>
            ) : (
              <p className="text-success">المسابقة جاهزة للنشر.</p>
            )}
            <div className="dashboard-actions">
              <Button variant="outline" type="button" onClick={saveDraft}>
                <Save aria-hidden="true" /> حفظ المسودة محليًا
              </Button>
              <Button
                type="button"
                onClick={saveQuiz}
                loading={savingQuiz}
                disabled={savingQuiz || !quizValidation.success}
                aria-describedby={
                  !quizValidation.success ? 'quiz-builder-validation-reason' : undefined
                }
              >
                <CheckCircle2 aria-hidden="true" /> نشر المسابقة
              </Button>
            </div>
            {savedQuizId && savedGameMode && !saveFailed ? (
              <ButtonLink href={playHrefForPack(savedGameMode, savedQuizId)} variant="gold">
                شغّل بهذه الحزمة
              </ButtonLink>
            ) : null}
          </>
        ) : null}
      </Card>

      <div className={styles.navigation} aria-label="التنقل بين خطوات المنشئ">
        <Button
          type="button"
          variant="outline"
          disabled={currentStep === 0}
          onClick={() => setCurrentStep((step) => Math.max(0, step - 1))}
        >
          الخطوة السابقة
        </Button>
        <Button type="button" variant="outline" onClick={saveDraft}>
          <Save aria-hidden="true" /> حفظ المسودة محليًا
        </Button>
        {currentStep < STEPS.length - 1 ? (
          <Button type="button" onClick={() => setCurrentStep((step) => Math.min(4, step + 1))}>
            التالي: {STEP_NEXT_LABELS[currentStep]}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

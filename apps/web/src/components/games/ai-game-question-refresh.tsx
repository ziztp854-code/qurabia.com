'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import styles from './ai-game-question-refresh.module.css';
import { Sparkles } from 'lucide-react';
import { z } from 'zod';
import { Button, Input } from '@/components/ui';
import { foldKeyword } from '@/lib/questions/keywords';
import {
  generatedGameQuestionsSchema,
  generatedGameQuestionSchema,
  type AiQuestionGame,
  type GeneratedGameQuestion,
} from '@/lib/ai/game-question-refresh-contract';

type QuestionContext = {
  game: AiQuestionGame;
  questions: readonly GeneratedGameQuestion[] | null;
  batchId: string;
  register: (prompts: string[]) => void;
};
const Context = createContext<QuestionContext | null>(null);

export function useAiGameQuestions(game: AiQuestionGame, prompts: readonly string[] = []) {
  const context = useContext(Context);
  const register = context?.game === game ? context.register : undefined;
  const promptKey = JSON.stringify(prompts);
  useEffect(() => {
    register?.(JSON.parse(promptKey) as string[]);
  }, [register, promptKey]);
  return context?.game === game ? context : null;
}

export function AiGameQuestionRefresh({
  game,
  children,
  showExternalTopicNotice = false,
  showGenerator = true,
}: {
  game: AiQuestionGame;
  children?: ReactNode;
  showExternalTopicNotice?: boolean;
  showGenerator?: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const isLadder = game === 'ladder';
  const showLadderProviderNotice = isLadder && showExternalTopicNotice;
  const [topic, setTopic] = useState('ثقافة عامة');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<{
    questions: GeneratedGameQuestion[];
    batchId: string;
    playHref?: string;
  } | null>(null);
  const [active, setActive] = useState<typeof draft>(null);
  const seen = useRef(new Set<string>());
  const pending = useRef(false);
  const requestController = useRef<AbortController | null>(null);
  useEffect(() => () => requestController.current?.abort(), []);
  const register = useCallback((prompts: string[]) => {
    prompts.forEach((prompt) => seen.current.add(prompt));
  }, []);
  const context = useMemo(
    () => ({
      game,
      questions: active?.questions ?? null,
      batchId: active?.batchId ?? '',
      register,
    }),
    [game, active, register],
  );

  async function generate() {
    if (pending.current) return;
    if (!isLadder && topic.trim().length < 3) {
      setError('اكتب موضوعًا من ثلاثة أحرف على الأقل.');
      return;
    }
    pending.current = true;
    setLoading(true);
    setError('');
    const controller = new AbortController();
    requestController.current = controller;
    try {
      const response = await fetch('/api/ai/game-questions/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          game,
          // Keep the existing request schema without putting a topic filter on the Ladder bank.
          topic: isLadder ? 'ثقافة عامة' : topic,
          excludePrompts: [...seen.current].slice(-80).map((prompt) => prompt.slice(0, 240)),
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        game?: string;
        questions?: unknown;
        batchId?: string;
        playHref?: string;
        message?: string;
      };
      if (!response.ok || !payload.ok || payload.game !== game || !payload.batchId)
        throw new Error(payload.message || 'تعذّر جلب الأسئلة الآن.');
      const schema =
        game === 'ladder'
          ? z.object({ questions: z.array(generatedGameQuestionSchema).length(10) })
          : generatedGameQuestionsSchema;
      const questions = schema.parse({ questions: payload.questions }).questions;
      const previousPrompts = new Set([...seen.current].map(foldKeyword));
      if (questions.some((question) => previousPrompts.has(foldKeyword(question.prompt)))) {
        throw new Error('تضمنت المجموعة سؤالًا سبق استخدامه. أعد جلب الأسئلة.');
      }
      if (
        (game === 'ladder' || game === 'elimination-live') &&
        !payload.playHref?.startsWith(`/games/${game}/host?quizId=`)
      )
        throw new Error('تعذّر إعداد حزمة الغرفة.');
      register(questions.map((question) => question.prompt));
      setDraft({ questions, batchId: payload.batchId, playHref: payload.playHref });
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : 'تعذّر جلب الأسئلة الآن.');
    } finally {
      pending.current = false;
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  function approve() {
    if (!draft || loading) return;
    if ((game === 'ladder' || game === 'elimination-live') && draft.playHref) {
      router.push(draft.playHref);
      return;
    }
    setActive(draft);
    setDraft(null);
  }

  return (
    <Context.Provider value={context}>
      {showGenerator && (
        <section
          className={`game-pack-picker ${styles.refresh}`}
          aria-label={
            isLadder ? 'اختيار أسئلة من بنك السلم' : 'تجديد أسئلة اللعبة بالذكاء الاصطناعي'
          }
        >
          <details>
            <summary>
              {isLadder ? 'اختيار أسئلة من بنك السلم' : 'جلب أسئلة جديدة بالذكاء الاصطناعي'}
            </summary>
            <div className="stack-form">
              <p>
                {isLadder
                  ? 'تُختار 10 أسئلة منشورة من جميع تصنيفات بنك السلم، ثم يمكنك مراجعتها واعتمادها.'
                  : 'استخدم هذا الخيار إذا سبق لعب الأسئلة. راجع المجموعة الجديدة ثم اعتمدها لبدء جولة جديدة.'}
              </p>
              {isLadder ? (
                showLadderProviderNotice && (
                  <p id={id}>
                    قد تُرسل نصوص بعض الأسئلة المنشورة إلى مزوّد الذكاء الاصطناعي للمساعدة في
                    اختيارها.
                  </p>
                )
              ) : (
                <Input
                  id={id}
                  label="موضوع الأسئلة الجديدة"
                  description={
                    showExternalTopicNotice
                      ? 'قد يحتفظ مزوّد الذكاء الاصطناعي بموضوع الأسئلة ويستخدمه. لا تدخل بيانات شخصية.'
                      : undefined
                  }
                  value={topic}
                  maxLength={120}
                  onChange={(event) => setTopic(event.target.value)}
                  disabled={loading}
                />
              )}
              <Button
                type="button"
                variant="outline"
                loading={loading}
                aria-describedby={showLadderProviderNotice ? id : undefined}
                onClick={generate}
              >
                <Sparkles aria-hidden="true" />
                {isLadder ? 'اختيار أسئلة من البنك' : 'جلب أسئلة جديدة بالذكاء الاصطناعي'}
              </Button>
              {loading ? <p role="status">جارٍ جلب أسئلة جديدة…</p> : null}
              {error ? <p role="alert">{error}</p> : null}
              {active ? (
                <p role="status">تم اعتماد {active.questions.length} سؤالًا جديدًا لهذه اللعبة.</p>
              ) : null}
              {draft ? (
                <div className="notice-card">
                  <strong>{draft.questions.length} سؤالًا جديدًا للمراجعة</strong>
                  <details>
                    <summary>مراجعة الأسئلة والإجابات</summary>
                    <ol>
                      {draft.questions.map((question, index) => (
                        <li key={index}>
                          {question.prompt}
                          <p>الإجابة: {question.answer}</p>
                        </li>
                      ))}
                    </ol>
                  </details>
                  <Button type="button" variant="gold" disabled={loading} onClick={approve}>
                    {game === 'ladder' || game === 'elimination-live'
                      ? 'اعتماد الأسئلة لغرفة جديدة'
                      : 'اعتماد الأسئلة وبدء جولة جديدة'}
                  </Button>
                </div>
              ) : null}
            </div>
          </details>
        </section>
      )}
      <div key={active?.batchId ?? 'initial'}>{children}</div>
    </Context.Provider>
  );
}

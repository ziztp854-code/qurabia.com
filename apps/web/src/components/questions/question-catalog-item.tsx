import { formatNumber } from '@/lib/utils';
import { CircleDot, Clock3, Flame, Gauge, ListChecks, Pencil, ToggleLeft } from 'lucide-react';
import Link from 'next/link';
import { ArchiveQuestionButton } from '@/components/questions/archive-question-button';
import { AddQuestionToQuizButton } from '@/components/questions/add-question-to-quiz-button';
import { QuestionImage } from '@/components/questions/question-image';
import {
  DIFFICULTY_LABEL,
  STATUS_LABEL,
  TYPE_LABEL,
  type BankView,
} from '@/lib/questions/bank-display';
import styles from './question-catalog-item.module.css';

export type CatalogQuestion = {
  id: string;
  prompt: string;
  imageUrl?: string | null;
  timeLimit: number;
  type: string;
  difficulty: string;
  status: string;
  basePoints: number;
  version?: number;
  gameTypes?: string[];
  options: Array<{ id: string }>;
  category?: { id: string; name: string } | null;
};

const DIFFICULTY_ICON = {
  EASY: CircleDot,
  MEDIUM: Gauge,
  HARD: Flame,
} as const;

type DifficultyKey = keyof typeof DIFFICULTY_LABEL;
type TypeKey = keyof typeof TYPE_LABEL;
type StatusKey = keyof typeof STATUS_LABEL;

function isDifficulty(value: string): value is DifficultyKey {
  return value in DIFFICULTY_LABEL;
}

function isType(value: string): value is TypeKey {
  return value in TYPE_LABEL;
}

function isStatus(value: string): value is StatusKey {
  return value in STATUS_LABEL;
}

export function QuestionCatalogItem({
  question,
  view,
}: {
  question: CatalogQuestion;
  view: BankView;
}) {
  const difficulty = isDifficulty(question.difficulty) ? question.difficulty : 'MEDIUM';
  const type = isType(question.type) ? question.type : 'MULTIPLE_CHOICE';
  const status = isStatus(question.status) ? question.status : 'DRAFT';
  const DifficultyIcon = DIFFICULTY_ICON[difficulty];
  const TypeIcon = type === 'TRUE_FALSE' ? ToggleLeft : ListChecks;
  const optionCount = question.options.length;

  return (
    <article
      className={`${styles.tile}`}
      data-view={view}
      data-difficulty={difficulty}
      data-status={status}
    >
      <span className={styles.slit} aria-hidden="true" />
      {question.imageUrl ? (
        <QuestionImage src={question.imageUrl} alt="" className={styles.media} />
      ) : null}
      <div className={styles.body}>
        <div className={styles.meta}>
          <span className={styles.pill} data-tone="type">
            <TypeIcon size={14} aria-hidden="true" />
            {TYPE_LABEL[type]}
          </span>
          <span className={styles.pill} data-tone="difficulty">
            <DifficultyIcon size={14} aria-hidden="true" />
            {DIFFICULTY_LABEL[difficulty]}
          </span>
          <span className={styles.pill} data-tone="status" data-value={status}>
            {STATUS_LABEL[status]}
          </span>
        </div>
        <p className={styles.prompt}>{question.prompt}</p>
        <dl className={styles.facts}>
          <div className={styles.fact}>
            <dt>خيارات</dt>
            <dd>{formatNumber(optionCount)}</dd>
          </div>
          <div className={styles.fact}>
            <dt>
              <Clock3 size={14} aria-hidden="true" />
              وقت
            </dt>
            <dd>{formatNumber(question.timeLimit)} ث</dd>
          </div>
          <div className={styles.fact}>
            <dt>نقاط</dt>
            <dd>{formatNumber(question.basePoints)}</dd>
          </div>
        </dl>
      </div>
      {question.status !== 'ARCHIVED' ? (
        <div className={styles.actions}>
          {optionCount > 0 ? (
            <AddQuestionToQuizButton
              question={{
                id: question.id,
                prompt: question.prompt,
                category: question.category?.name ?? '',
                duration: question.timeLimit,
                points: question.basePoints,
                questionVersion: question.version,
                gameTypes: question.gameTypes,
              }}
            />
          ) : (
            <span className="text-danger">أضف خيارات إجابة قبل اختيار السؤال.</span>
          )}
          <Link href={`/questions/${question.id}`} className={styles.editLink}>
            <Pencil size={16} aria-hidden="true" />
            تعديل
          </Link>
          <ArchiveQuestionButton questionId={question.id} />
        </div>
      ) : null}
    </article>
  );
}

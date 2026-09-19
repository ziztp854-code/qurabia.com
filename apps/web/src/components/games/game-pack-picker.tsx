import Link from 'next/link';
import {
  playHrefForPack,
  type QuestionFeedGameMode,
  type QuizPackSummary,
} from '@/lib/questions/feed/types';
import { formatNumber } from '@/lib/utils';

type GamePackPickerProps = {
  gameMode: QuestionFeedGameMode;
  packs: readonly QuizPackSummary[];
  selectedQuizId?: string | null;
  bankLabel?: string;
};

export function GamePackPicker({
  gameMode,
  packs,
  selectedQuizId,
  bankLabel = 'بنك الوسوم (الافتراضي)',
}: GamePackPickerProps) {
  return (
    <section className="game-pack-picker" aria-label="مصدر الأسئلة">
      <header className="game-pack-picker__header">
        <h2>مصدر الأسئلة</h2>
        <p>اختر حزمة محفوظة من المنشئ، أو استخدم بنك الوسوم الحالي.</p>
      </header>

      <div className="game-pack-picker__options">
        <Link
          href={playHrefForPack(gameMode)}
          className={`game-pack-picker__option${!selectedQuizId ? ' is-active' : ''}`}
        >
          <strong>{bankLabel}</strong>
          <span>أسئلة موسومة لهذا الوضع من البنك</span>
        </Link>

        {packs.map((pack) => {
          const href = playHrefForPack(gameMode, pack.id);
          const active = selectedQuizId === pack.id;
          return (
            <Link
              key={pack.id}
              href={href}
              className={`game-pack-picker__option${active ? ' is-active' : ''}`}
            >
              <strong>{pack.title}</strong>
              <span>
                {formatNumber(pack.questionCount)} سؤال · رمز {pack.roomCode}
              </span>
            </Link>
          );
        })}
      </div>

      {packs.length === 0 ? (
        <p className="game-pack-picker__empty">
          لا توجد حزم محفوظة لهذا الوضع بعد. أنشئها من منشئ المسابقة.
        </p>
      ) : null}
    </section>
  );
}

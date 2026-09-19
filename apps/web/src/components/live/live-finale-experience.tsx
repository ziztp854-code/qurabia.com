'use client';
import { formatNumber } from '@/lib/utils';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  ArrowLeft,
  Award,
  Check,
  Crown,
  Medal,
  RotateCcw,
  SkipForward,
  Sparkles,
  Trophy,
  UsersRound,
} from 'lucide-react';

const LiveCrowningScene3D = dynamic(
  () => import('./live-crowning-scene-3d').then((module) => module.LiveCrowningScene3D),
  {
    ssr: false,
    loading: () => (
      <div
        aria-hidden="true"
        data-live-crowning-scene="loading"
        style={{
          width: 'min(100%, 34rem)',
          height: 'clamp(14rem, 32vw, 20rem)',
          marginBlock: '1rem',
        }}
      />
    ),
  },
);

export const FINALE_REVEAL_DELAY = 900;
export const FINALE_REVEAL_INTERVAL = 1_400;
export const FINALE_WINNER_HOLD_INTERVAL = 2_400;

export type FinalePlayer = {
  id: string;
  name: string;
  score: number;
  rank: number;
  correctAnswers?: number;
};

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? '؟') + (parts[1]?.[0] ?? '');
}

function getPersonalMessage(rank: number) {
  if (rank === 1) return 'أنت بطل هذه الجولة';
  if (rank <= 3) return 'أنهيت الجولة على منصة التتويج';
  return 'أكملت الجولة وسُجل ترتيبك النهائي';
}

function getRevealHoldInterval(player?: FinalePlayer) {
  return player?.rank === 1 ? FINALE_WINNER_HOLD_INTERVAL : FINALE_REVEAL_INTERVAL;
}

function playRevealTone(rank: number) {
  const AudioContextType =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextType) return;

  try {
    const context = new AudioContextType();
    const notes =
      rank === 1 ? [523.25, 659.25, 783.99, 1046.5] : rank === 2 ? [659.25, 987.77] : [392, 523.25];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + index * 0.07;
      const end = start + (rank === 1 && index === notes.length - 1 ? 0.6 : 0.35);
      oscillator.type = rank === 1 ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(rank === 1 ? 0.08 : 0.05, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(end);
      if (index === notes.length - 1)
        oscillator.addEventListener('ended', () => void context.close(), { once: true });
    });
  } catch {
    // Browsers may block audio before the first user interaction.
  }
}

function RoyalPodiumPlace({ player }: { player: FinalePlayer }) {
  return (
    <li className={`royal-podium-place is-rank-${player.rank}`}>
      <div className="royal-podium-avatar" aria-hidden="true">
        <Crown />
        <span>{getInitials(player.name)}</span>
        <i>{formatNumber(player.rank)}</i>
      </div>
      <strong>{player.name}</strong>
      <Trophy aria-hidden="true" />
      <b>{formatNumber(player.score)}</b>
      <small>نقطة</small>
    </li>
  );
}

export function LiveFinaleExperience({
  players,
  participantId,
  soundEnabled = true,
  roomCode,
  quizTitle,
  roundNumber,
  totalRounds,
}: {
  players: FinalePlayer[];
  participantId?: string;
  soundEnabled?: boolean;
  roomCode?: string;
  quizTitle?: string;
  roundNumber?: number;
  totalRounds?: number;
}) {
  const rankedPlayers = useMemo(
    () => [...players].sort((first, second) => first.rank - second.rank),
    [players],
  );
  const revealPlayers = useMemo(() => rankedPlayers.slice(0, 3).reverse(), [rankedPlayers]);
  const [revealStep, setRevealStep] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const [runId, setRunId] = useState(0);
  const finalStep = revealPlayers.length + 1;
  const isFinal = revealStep === finalStep;
  const revealedPlayer =
    revealStep > 0 && revealStep <= revealPlayers.length
      ? revealPlayers[revealStep - 1]
      : undefined;
  const personalResult = participantId
    ? rankedPlayers.find((player) => player.id === participantId)
    : undefined;
  const podiumOrder = [rankedPlayers[1], rankedPlayers[0], rankedPlayers[2]].filter(
    (player): player is FinalePlayer => Boolean(player),
  );
  const hasRoundProgress = roundNumber !== undefined && totalRounds !== undefined;
  const roundProgressLabel = hasRoundProgress
    ? `الجولة ${formatNumber(roundNumber)} من ${formatNumber(totalRounds)}`
    : 'بيانات الجولة غير متاحة';

  useEffect(() => {
    if (skipped) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const timer = window.setTimeout(() => setRevealStep(finalStep), 0);
      return () => window.clearTimeout(timer);
    }

    const timers = revealPlayers.map((_, index) =>
      window.setTimeout(
        () => setRevealStep(index + 1),
        FINALE_REVEAL_DELAY + index * FINALE_REVEAL_INTERVAL,
      ),
    );
    const lastReveal = revealPlayers.at(-1);
    const finalDelay =
      revealPlayers.length === 0
        ? FINALE_REVEAL_DELAY
        : FINALE_REVEAL_DELAY +
          (revealPlayers.length - 1) * FINALE_REVEAL_INTERVAL +
          getRevealHoldInterval(lastReveal);
    timers.push(window.setTimeout(() => setRevealStep(finalStep), finalDelay));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [finalStep, revealPlayers, runId, skipped]);

  useEffect(() => {
    if (soundEnabled && revealedPlayer) playRevealTone(revealedPlayer.rank);
  }, [revealedPlayer, soundEnabled]);

  const replay = () => {
    setRevealStep(0);
    setSkipped(false);
    setRunId((value) => value + 1);
  };

  const skipToResult = () => {
    setSkipped(true);
    setRevealStep(finalStep);
  };

  if (!isFinal) {
    const revealTitle =
      revealedPlayer?.rank === 1
        ? 'بطل الجولة'
        : revealedPlayer?.rank === 2
          ? 'المركز الثاني'
          : revealedPlayer?.rank === 3
            ? 'المركز الثالث'
            : 'انتهت الجولة';

    return (
      <section
        className="royal-live royal-finale-screen royal-finale-ceremony"
        aria-labelledby="finale-title"
        data-finale-step={revealedPlayer?.rank ?? 'intro'}
      >
        <header className="royal-finale-topbar">
          <div aria-label={roundProgressLabel}>
            <span>الجولة</span>
            <strong>{hasRoundProgress ? formatNumber(roundNumber) : '—'}</strong>
            <small>من {hasRoundProgress ? formatNumber(totalRounds) : '—'}</small>
          </div>
          <span>
            <Crown aria-hidden="true" /> تحدّي
          </span>
          <div>
            <UsersRound aria-hidden="true" />
            <strong>{formatNumber(rankedPlayers.length)}</strong>
            <small>متسابق</small>
          </div>
        </header>
        <div className="royal-ceremony-moment" role="status" aria-live="polite">
          <Sparkles aria-hidden="true" />
          <p>{revealedPlayer ? 'لحظة الإعلان' : 'استعدوا لإعلان الفائزين'}</p>
          <h1 id="finale-title">{revealTitle}</h1>
          <LiveCrowningScene3D
            activeRank={
              revealedPlayer?.rank === 1 ||
              revealedPlayer?.rank === 2 ||
              revealedPlayer?.rank === 3
                ? revealedPlayer.rank
                : undefined
            }
          />
          {revealedPlayer ? (
            <div className={`royal-reveal-player is-rank-${revealedPlayer.rank}`}>
              <span aria-hidden="true">{revealedPlayer.rank === 1 ? <Crown /> : <Medal />}</span>
              {revealedPlayer.rank === 1 && <span className="sr-only">المركز الأول</span>}
              <i>{getInitials(revealedPlayer.name)}</i>
              <strong>{revealedPlayer.name}</strong>
              <b>{formatNumber(revealedPlayer.score)} نقطة</b>
              {revealedPlayer.correctAnswers !== undefined && (
                <small aria-label={`${formatNumber(revealedPlayer.correctAnswers)} إجابة صحيحة`}>
                  <Check aria-hidden="true" /> {formatNumber(revealedPlayer.correctAnswers)} إجابة
                  صحيحة
                </small>
              )}
            </div>
          ) : (
            <div className="royal-ceremony-countdown" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
          )}
        </div>
        <button type="button" className="royal-skip-button" onClick={skipToResult}>
          <SkipForward aria-hidden="true" /> عرض النتيجة الآن
        </button>
      </section>
    );
  }

  return (
    <section
      className="royal-live royal-finale-screen is-final"
      aria-labelledby="finale-title"
      data-finale-step="summary"
    >
      <header className="royal-finale-topbar">
        <div aria-label={roundProgressLabel}>
          <span>الجولة</span>
          <strong>{hasRoundProgress ? formatNumber(roundNumber) : '—'}</strong>
          <small>من {hasRoundProgress ? formatNumber(totalRounds) : '—'}</small>
        </div>
        <span>
          <Crown aria-hidden="true" /> تحدّي
        </span>
        <div>
          <UsersRound aria-hidden="true" />
          <strong>{formatNumber(rankedPlayers.length)}</strong>
          <small>متسابق</small>
        </div>
      </header>

      <div className="royal-finale-heading">
        <Crown aria-hidden="true" />
        <h1 id="finale-title">المركز الأول</h1>
        <p>تهانينا للبطل</p>
        <h2 className="sr-only">الفائزون</h2>
      </div>

      {rankedPlayers.length > 0 ? (
        <ol className="royal-podium" aria-label="منصة الفائزين">
          {podiumOrder.map((player) => (
            <RoyalPodiumPlace key={player.id} player={player} />
          ))}
        </ol>
      ) : (
        <div className="royal-finale-empty">
          <Trophy aria-hidden="true" />
          <h2>لا توجد نتائج مسجلة</h2>
        </div>
      )}

      {rankedPlayers[0] && (
        <aside className="royal-winner-thanks" aria-label="إعلان الفائز">
          <Crown aria-hidden="true" />
          <strong>الفائز: {rankedPlayers[0].name}</strong>
          <span>شكرًا لكم!</span>
          <p>نراكم في الجولة القادمة</p>
        </aside>
      )}

      {personalResult && (
        <aside className="royal-personal-result" aria-label="نتيجتك الشخصية">
          <Award aria-hidden="true" />
          <strong>{getPersonalMessage(personalResult.rank)}</strong>
          <span>المركز {formatNumber(personalResult.rank)}</span>
          <span>{formatNumber(personalResult.score)} نقطة</span>
          {personalResult.correctAnswers !== undefined && (
            <span>{formatNumber(personalResult.correctAnswers)} إجابة صحيحة</span>
          )}
          <span>{formatNumber(rankedPlayers.length)} متسابق</span>
        </aside>
      )}

      <div className="royal-finale-actions">
        <Link href="/">
          العودة إلى اللوحة الرئيسية <ArrowLeft aria-hidden="true" />
        </Link>
        <button type="button" onClick={replay}>
          <RotateCcw aria-hidden="true" /> إعادة التتويج
        </button>
      </div>

      <section className="royal-full-ranking">
        <h2>ترتيب المتسابقين</h2>
        <ol>
          {rankedPlayers.slice(0, 10).map((player) => (
            <li
              key={player.id}
              className={player.id === participantId ? 'is-current-player' : undefined}
            >
              <span>{formatNumber(player.rank)}</span>
              <strong>{player.name}</strong>
              <b>{formatNumber(player.score)} نقطة</b>
              {player.correctAnswers !== undefined && (
                <small>{formatNumber(player.correctAnswers)} صحيحة</small>
              )}
            </li>
          ))}
        </ol>
      </section>
      <span className="sr-only">{quizTitle ?? roomCode ?? 'النتائج النهائية'}</span>
    </section>
  );
}

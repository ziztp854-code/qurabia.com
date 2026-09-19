'use client';

import { Check,
  Clock3,
  Copy,
  Crown,
  Flame,
  Medal,
  Minus,
  Pause,
  Play,
  Share2,
  Signal,
  Sparkles,
  Trophy,
  TrendingDown,
  TrendingUp,
  UserRoundCog,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import QRCode from 'react-qr-code';
import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn, formatNumber } from '@/lib/utils';
import { Avatar, Badge, Button, Card, Progress } from '@/components/ui';

export function QuizTimer({
  total,
  remaining,
  mode = 'circular',
  size = 'md',
  disableMotion = false,
}: {
  total: number;
  remaining: number;
  mode?: 'circular' | 'horizontal' | 'digital';
  size?: 'sm' | 'md' | 'lg';
  disableMotion?: boolean;
}) {
  const percentage = Math.max(0, Math.min(100, (remaining / total) * 100));
  const state = percentage <= 20 ? 'danger' : percentage <= 45 ? 'warning' : 'safe';
  if (mode === 'horizontal')
    return (
      <div className={cn('quiz-timer horizontal', `timer-${state}`, `timer-${size}`)}>
        <div className="inline-between">
          <span>
            <Clock3 />
            الوقت المتبقي
          </span>
          <strong dir="ltr">{remaining}s</strong>
        </div>
        <Progress value={percentage} label="الوقت المتبقي" />
      </div>
    );
  if (mode === 'digital')
    return (
      <output
        className={cn('quiz-timer digital', `timer-${state}`, `timer-${size}`)}
        aria-label={`${formatNumber(remaining)} ثانية متبقية`}
      >
        <Clock3 />
        {remaining}
      </output>
    );
  return (
    <div
      className={cn(
        'quiz-timer circular',
        `timer-${state}`,
        `timer-${size}`,
        !disableMotion && percentage <= 20 && 'timer-pulse',
      )}
      role="timer"
      aria-label={`${formatNumber(remaining)} ثانية متبقية`}
      style={{ '--timer-progress': `${percentage * 3.6}deg` } as React.CSSProperties}
    >
      <span>{remaining}</span>
      <small>ثانية</small>
    </div>
  );
}

export type QuestionCardProps = {
  number: number;
  text: string;
  type: string;
  image?: string;
  audio?: string;
  video?: string;
  difficulty: string;
  points: number;
  time: number;
  category: string;
  status: string;
  children?: ReactNode;
};
export function QuestionCard({
  number,
  text,
  type,
  image,
  audio,
  video,
  difficulty,
  points,
  time,
  category,
  status,
  children,
}: QuestionCardProps) {
  return (
    <Card className="question-card">
      <div className="question-meta">
        <Badge>السؤال {number}</Badge>
        <Badge>{category}</Badge>
        <span>{difficulty}</span>
        <span>{points} نقطة</span>
        <span>{time} ثانية</span>
        <span>{type}</span>
        <Badge className="badge-live">{status}</Badge>
      </div>
      <h1>{text}</h1>
      {image && (
        <div className="media-placeholder" role="img" aria-label="صورة السؤال">
          {image}
        </div>
      )}
      {audio && (
        <audio controls src={audio}>
          متصفحك لا يدعم الصوت.
        </audio>
      )}
      {video && (
        <video controls src={video}>
          متصفحك لا يدعم الفيديو.
        </video>
      )}
      {children}
    </Card>
  );
}

export type AnswerState = 'default' | 'selected' | 'correct' | 'wrong' | 'disabled' | 'submitting';
export function AnswerOption({
  label,
  text,
  state = 'default',
  percentage,
  image,
  onSelect,
}: {
  label: 'A' | 'B' | 'C' | 'D';
  text: string;
  state?: AnswerState;
  percentage?: number;
  image?: string;
  onSelect?: () => void;
}) {
  const handleKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (['Enter', ' '].includes(event.key)) {
      event.preventDefault();
      onSelect?.();
    }
  };
  return (
    <button
      type="button"
      className={cn('answer-option', `option-${label.toLowerCase()}`, `is-${state}`)}
      disabled={state === 'disabled' || state === 'submitting'}
      aria-pressed={state === 'selected'}
      aria-label={`${label}: ${text}${percentage !== undefined ? `، اختارها ${percentage} بالمئة` : ''}`}
      onClick={onSelect}
      onKeyDown={handleKey}
    >
      <span className="answer-letter">{label}</span>
      {image && (
        <span className="answer-image" role="img" aria-label="صورة الإجابة">
          {image}
        </span>
      )}
      <span className="answer-text">{text}</span>
      {percentage !== undefined && (
        <span className="answer-percentage" dir="ltr">
          {percentage}%
        </span>
      )}
      {state === 'correct' && <Check aria-label="صحيحة" />}
      {state === 'wrong' && <X aria-label="خاطئة" />}
    </button>
  );
}

export function LeaderboardItem({
  rank,
  initials,
  name,
  score,
  change,
  streak,
  online,
}: {
  rank: number;
  initials: string;
  name: string;
  score: number;
  change: number;
  streak: number;
  online: boolean;
}) {
  const ChangeIcon = change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus;
  return (
    <div className={cn('leaderboard-item', rank <= 3 && `rank-${rank}`)}>
      <span className="rank">{rank <= 3 ? <Medal /> : rank}</span>
      <Avatar initials={initials} />
      <div className="player-name">
        <strong>{name}</strong>
        <span className={online ? 'online' : 'offline'}>
          {online ? <Wifi /> : <WifiOff />}
          {online ? 'متصل' : 'غير متصل'}
        </span>
      </div>
      <span className="streak">
        <Flame />
        {streak}
      </span>
      <span className={cn('rank-change', change > 0 && 'up', change < 0 && 'down')}>
        <ChangeIcon />
        {Math.abs(change)}
      </span>
      <strong className="score" dir="ltr">
        {formatNumber(score)}
      </strong>
    </div>
  );
}

export function PlayerJoinCard({
  name,
  initials,
  online,
  joinedAt,
  ready,
  hostTools = false,
}: {
  name: string;
  initials: string;
  online: boolean;
  joinedAt: string;
  ready: boolean;
  hostTools?: boolean;
}) {
  return (
    <Card className="player-join">
      <Avatar initials={initials} />
      <div>
        <strong>{name}</strong>
        <small>{joinedAt}</small>
      </div>
      <Badge className={ready ? 'badge-success' : ''}>{ready ? 'مستعد' : 'ينتظر'}</Badge>
      <span className={online ? 'online-dot' : 'offline-dot'} aria-hidden="true" />
      <span className="sr-only">{online ? 'متصل' : 'غير متصل'}</span>
      {hostTools && (
        <Button variant="ghost" size="icon" aria-label={`إدارة اللاعب ${name}`}>
          <UserRoundCog />
        </Button>
      )}
    </Card>
  );
}

export function WaitingList({
  players,
  minimumPlayers,
  hostView = false,
}: {
  players: { name: string; initials: string; joinedAt: string; ready: boolean }[];
  minimumPlayers?: number;
  hostView?: boolean;
}) {
  const waitingCount = players.filter((player) => !player.ready).length;
  const readyCount = players.filter((player) => player.ready).length;
  const remaining = minimumPlayers ? Math.max(0, minimumPlayers - players.length) : 0;
  const canStart = remaining === 0;

  return (
    <Card className="waiting-list">
      <div className="waiting-list__header">
        <div>
          <h3>قائمة الانتظار</h3>
          <p>
            {canStart
              ? `اكتمل العدد المطلوب من اللاعبين (${players.length})`
              : remaining === 1
                ? 'ينقص لاعب واحد لبدء اللعبة'
                : `ينقص ${formatNumber(remaining)} لاعبين لبدء اللعبة`}
          </p>
        </div>
        <div className="waiting-list__counts">
          <span className="waiting-badge waiting-badge--ready">
            <Signal aria-hidden="true" />
            {formatNumber(readyCount)} مستعد
          </span>
          {waitingCount > 0 && (
            <span className="waiting-badge waiting-badge--waiting">
              <Clock3 aria-hidden="true" />
              {formatNumber(waitingCount)} ينتظر
            </span>
          )}
        </div>
      </div>

      <ol className="waiting-list__players">
        {players.map((player, index) => (
          <li className="waiting-list__player" key={`${player.name}-${index}`}>
            <span className="waiting-list__rank">{index + 1}</span>
            <Avatar initials={player.initials} className="waiting-list__avatar" />
            <div className="waiting-list__info">
              <strong>{player.name}</strong>
              <small>{player.joinedAt}</small>
            </div>
            {hostView && (
              <Badge className={player.ready ? 'badge-success' : ''}>
                {player.ready ? 'مستعد' : 'ينتظر'}
              </Badge>
            )}
            {!player.ready && <span className="waiting-list__dot waiting-dot" aria-hidden="true" />}
            {player.ready && <span className="waiting-list__dot ready-dot" aria-hidden="true" />}
          </li>
        ))}
        {players.length === 0 && (
          <li className="waiting-list__empty">
            <Users aria-hidden="true" />
            <span>بانتظار أول لاعب...</span>
          </li>
        )}
      </ol>

      {canStart && hostView && (
        <div className="waiting-list__actions">
          <Button type="button" variant="gold">
            <Play aria-hidden="true" />
            بدء اللعبة
          </Button>
        </div>
      )}
    </Card>
  );
}

export function RoomCode({ code, url = '/join' }: { code: string; url?: string }) {
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [inviteUrl, setInviteUrl] = useState(() => (url.startsWith('http') ? url : ''));

  useEffect(() => {
    const absoluteUrl = url.startsWith('http')
      ? url
      : new URL(url, `${window.location.origin}/`).toString();
    const timer = window.setTimeout(() => setInviteUrl(absoluteUrl), 0);
    return () => window.clearTimeout(timer);
  }, [url]);

  const copy = async () => {
    await navigator.clipboard?.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  const copyLink = async () => {
    const absoluteUrl =
      inviteUrl ||
      (url.startsWith('http') ? url : new URL(url, `${window.location.origin}/`).toString());
    await navigator.clipboard?.writeText(absoluteUrl);
    setCopiedLink(true);
    window.setTimeout(() => setCopiedLink(false), 1500);
  };
  return (
    <Card className="room-code">
      <div className="room-qr">
        {inviteUrl ? (
          <QRCode
            aria-label={`رمز QR للانضمام إلى الغرفة ${code}`}
            bgColor="var(--qr-paper)"
            className="room-qr-code"
            fgColor="var(--qr-ink)"
            level="M"
            role="img"
            size={112}
            title={`امسح الرمز للانضمام إلى الغرفة ${code}`}
            value={inviteUrl}
          />
        ) : (
          <span className="sr-only" role="status">
            جارٍ تجهيز رمز QR…
          </span>
        )}
      </div>
      <div>
        <small>رمز الغرفة</small>
        <strong dir="ltr">{code}</strong>
        <span className="room-invite-url" dir="ltr">
          {inviteUrl || url}
        </span>
      </div>
      <div className="room-actions">
        <Button variant="outline" onClick={copy}>
          {copied ? <Check /> : <Copy />}
          {copied ? 'تم النسخ' : 'نسخ الرمز'}
        </Button>
        <Button variant="ghost" onClick={copyLink}>
          {copiedLink ? <Check /> : <Share2 />}
          {copiedLink ? 'نُسخ الرابط' : 'نسخ الدعوة'}
        </Button>
      </div>
    </Card>
  );
}

export function ScoreDisplay({
  score,
  earned = 0,
  multiplier = 1,
  streak = 0,
}: {
  score: number;
  earned?: number;
  multiplier?: number;
  streak?: number;
}) {
  return (
    <Card className="score-display">
      <small>نقاطك</small>
      <strong dir="ltr">{formatNumber(score)}</strong>
      {earned > 0 && <span className="earned">+{earned}</span>}
      <div>
        <Badge>×{multiplier}</Badge>
        <Badge className="badge-gold">
          <Flame />
          {streak}
        </Badge>
      </div>
    </Card>
  );
}

export function CountdownOverlay({
  value = '3',
  disableMotion = false,
}: {
  value?: '3' | '2' | '1' | 'ابدأ';
  disableMotion?: boolean;
}) {
  return (
    <div className={cn('countdown-overlay', !disableMotion && 'countdown-animated')} role="timer">
      <strong>{value}</strong>
    </div>
  );
}

export function WinnerPodium({
  winners,
  confetti = true,
}: {
  winners: { name: string; initials: string; score: number; correctAnswers?: number }[];
  confetti?: boolean;
}) {
  const finalists = winners.slice(0, 3);
  const rankMeta = {
    1: { label: 'الأول', pedestalTitle: 'الأول · بطل التحدي', CrownIcon: Crown, accent: 'var(--gold)' },
    2: { label: 'الثاني', pedestalTitle: 'الثاني · الوصيف', CrownIcon: Medal, accent: 'var(--neutral-silver)' },
    3: { label: 'الثالث', pedestalTitle: 'المركز الثالث', CrownIcon: Medal, accent: 'var(--neutral-bronze)' },
  } as const;

  if (finalists.length === 0) {
    return (
      <div className="podium-empty" role="status">
        <Trophy aria-hidden="true" />
        <strong>بانتظار النتائج النهائية</strong>
        <span>تظهر منصة التتويج بعد اعتماد ترتيب الجولة.</span>
      </div>
    );
  }

  return (
    <section className={cn('podium-stage', confetti && 'with-confetti')}>
      <div className="podium-holo-field" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <ol className="podium-wrap" aria-label="منصة الفائزين">
        {finalists.map((winner, index) => {
          const rank = index + 1;
          const meta = rankMeta[rank as keyof typeof rankMeta];
          const CrownIcon = meta.CrownIcon;
          return (
            <li className={cn('podium-player', `podium-${rank}`)} key={`${rank}-${winner.name}`}>
              <div
                className="podium-rank-badge"
                style={{ '--rank-accent': meta.accent } as React.CSSProperties}
              >
                {rank === 1 ? (
                  <CrownIcon aria-hidden="true" />
                ) : (
                  <strong aria-hidden="true">{rank}</strong>
                )}
                <span className="sr-only">{`المركز ${meta.label}`}</span>
              </div>
              <div className="podium-profile">
                <div className="podium-avatar-wrapper">
                  {rank === 1 && <Crown className="podium-floating-crown" aria-hidden="true" />}
                  <Avatar initials={winner.initials} />
                </div>
                <strong className="podium-name">{winner.name}</strong>
                <span className="podium-score" dir="ltr">
                  {formatNumber(winner.score)} نقطة
                </span>
                {winner.correctAnswers !== undefined && (
                  <span
                    className="podium-correct"
                    dir="ltr"
                    aria-label={`${formatNumber(winner.correctAnswers)} إجابة صحيحة`}
                  >
                    <Check aria-hidden="true" />
                    {formatNumber(winner.correctAnswers)}
                  </span>
                )}
              </div>
              <div className="podium-block">
                <strong aria-hidden="true">{rank}</strong>
                <small>{meta.pedestalTitle}</small>
                <span className="podium-block-shine" aria-hidden="true" />
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function LiveStatus({
  status,
}: {
  status: 'live' | 'waiting' | 'paused' | 'ended' | 'soon' | 'offline';
}) {
  const labels = {
    live: 'مباشر الآن',
    waiting: 'في الانتظار',
    paused: 'متوقف مؤقتًا',
    ended: 'انتهى',
    soon: 'يبدأ قريبًا',
    offline: 'غير متصل',
  };
  const icons = {
    live: <Signal />,
    waiting: <Clock3 />,
    paused: <Pause />,
    ended: <Trophy />,
    soon: <Play />,
    offline: <WifiOff />,
  };
  return (
    <Badge className={cn('live-status', `status-${status}`)}>
      {icons[status]}
      {labels[status]}
    </Badge>
  );
}
export function QuestionProgress({ current, total }: { current: number; total: number }) {
  const value = (current / total) * 100;
  return (
    <div className="question-progress">
      <div className="inline-between">
        <span>
          السؤال {current} من {total}
        </span>
        <strong>{Math.round(value)}%</strong>
      </div>
      <Progress value={value} label="تقدم الأسئلة" />
    </div>
  );
}

export function HostControls() {
  return (
    <div className="host-controls">
      <Button>
        <Play />
        التالي
      </Button>
      <Button variant="outline">
        <Pause />
        إيقاف مؤقت
      </Button>
      <Button variant="gold">
        <Sparkles />
        إظهار الإجابة
      </Button>
    </div>
  );
}

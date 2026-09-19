'use client';
import { formatNumber } from '@/lib/utils';

import Link from 'next/link';
import { memo, useEffect, useState } from 'react';
import { getQuestionRemainingMs } from '@tahaddi/contracts';
import type {
  GamePhase,
  QuestionPayload,
  QuestionRevealPayload,
  QuestionStatsPayload,
} from '@tahaddi/contracts';
import {
  Activity,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock3,
  Crown,
  Hourglass,
  LogOut,
  MousePointer2,
  QrCode,
  Radio,
  Settings,
  Target,
  Trophy,
  UsersRound,
  Wifi,
  WifiOff,
} from 'lucide-react';
import QRCode from 'react-qr-code';
import { LiveQuestionStage } from './live-question-stage';

function CompetitionStatusBar({
  title,
  identifier,
  status,
  roundLabel,
  questionType,
  contestantCount,
}: {
  title: string;
  identifier: string;
  status: string;
  roundLabel: string;
  questionType: string;
  contestantCount: number;
}) {
  return (
    <header className="competition-status-bar" aria-label="شريط معلومات المسابقة">
      <span className="competition-status-bar__status">
        <small>حالة الجولة</small>
        <strong>
          <i aria-hidden="true" /> {status}
        </strong>
      </span>
      <span className="competition-status-bar__round" aria-label={`السؤال ${roundLabel}`}>
        <small>رقم الجولة</small>
        <strong>{roundLabel}</strong>
      </span>
      <span className="competition-status-bar__identifier">
        <small>رقم المعرف</small>
        <strong dir="ltr">{identifier}</strong>
      </span>
      <span className="competition-status-bar__title" aria-label="تحدّي — منصة التحديات الذكية">
        <Crown aria-hidden="true" />
        <strong>{title}</strong>
      </span>
      <span className="competition-status-bar__type">
        <small>نوع السؤال</small>
        <strong>{questionType}</strong>
      </span>
      <span
        className="competition-status-bar__contestants"
        aria-label={`${formatNumber(contestantCount)} متسابق`}
      >
        <small>عدد المتسابقين</small>
        <strong>
          <UsersRound aria-hidden="true" /> {formatNumber(contestantCount)}
        </strong>
      </span>
    </header>
  );
}

export function LiveWaitingLobby({
  quizTitle,
  roomCode,
  joinUrl,
  participants,
  totalQuestions,
  questionTimeLimit,
  questionType = 'اختيار من متعدد',
}: {
  quizTitle: string;
  roomCode: string;
  joinUrl: string;
  participants: { id: string; name: string }[];
  totalQuestions: number;
  questionTimeLimit: number;
  questionType?: string;
}) {
  const participantCount = participants.length;

  return (
    <div className="royal-live royal-lobby-screen">
      <CompetitionStatusBar
        title={quizTitle}
        identifier={roomCode}
        status="في الانتظار"
        roundLabel={`0 من ${formatNumber(totalQuestions)}`}
        questionType={questionType}
        contestantCount={participantCount}
      />

      <nav className="royal-lobby-controls" aria-label="روابط شاشة الانتظار">
        <Link href="/" className="royal-outline-action">
          <LogOut aria-hidden="true" />
          خروج من اللوبي
        </Link>
        <Link href="/dashboard" className="royal-outline-action">
          <Settings aria-hidden="true" />
          إعدادات المسابقة
        </Link>
      </nav>

      <div className="royal-lobby-layout">
        <main className="royal-lobby-main">
          <section className="royal-lobby-heading" aria-labelledby="royal-lobby-title">
            <h1 id="royal-lobby-title">قاعة الانتظار</h1>
            <p>بانتظار بدء الجولة القادمة</p>
          </section>

          <p className="royal-lobby-share-copy">شارك رمز الغرفة مع أصدقائك للانضمام</p>

          <section className="royal-panel royal-lobby-access" aria-labelledby="royal-access-title">
            <h2 id="royal-access-title">رمز الغرفة</h2>
            <div className="royal-access-layout">
              <div className="royal-room-code">
                <strong dir="ltr">{roomCode}</strong>
              </div>
              <div className="royal-qr-block">
                <div role="img" aria-label="رمز QR للدخول إلى المسابقة">
                  <QRCode
                    value={joinUrl}
                    size={210}
                    bgColor="var(--qr-paper)"
                    fgColor="var(--qr-ink)"
                  />
                </div>
                <small>
                  <QrCode aria-hidden="true" /> امسح QR للدخول
                </small>
              </div>
            </div>
          </section>

          <dl className="royal-lobby-stats" aria-label="ملخص الجولة">
            <div>
              <UsersRound aria-hidden="true" />
              <dt>المتسابقون</dt>
              <dd>{formatNumber(participantCount)}</dd>
            </div>
            <div>
              <Clock3 aria-hidden="true" />
              <dt>وقت السؤال</dt>
              <dd>{formatNumber(questionTimeLimit)} ثانية</dd>
            </div>
            <div>
              <Target aria-hidden="true" />
              <dt>الأسئلة</dt>
              <dd>{formatNumber(totalQuestions)}</dd>
            </div>
          </dl>

          <p className="royal-lobby-ready">
            <Crown aria-hidden="true" /> استعد، ستبدأ الجولة قريبًا!
          </p>
        </main>

        <section
          className="royal-panel royal-lobby-participants"
          aria-labelledby="royal-participants-title"
        >
          <h2 id="royal-participants-title">
            <UsersRound aria-hidden="true" />
            المتسابقون ({formatNumber(participantCount)})
          </h2>
          {participantCount > 0 ? (
            <ol>
              {participants.map((participant, index) => (
                <li key={participant.id}>
                  <b>{formatNumber(index + 1)}</b>
                  <span aria-hidden="true">{participant.name.trim().charAt(0) || '؟'}</span>
                  <strong>{participant.name}</strong>
                  <small>
                    <i aria-hidden="true" /> متصل
                  </small>
                </li>
              ))}
            </ol>
          ) : (
            <p className="royal-lobby-empty">
              <Clock3 aria-hidden="true" /> بانتظار انضمام المتسابقين…
            </p>
          )}
        </section>

        <aside className="royal-panel royal-lobby-rules" aria-labelledby="royal-lobby-rules-title">
          <h2 id="royal-lobby-rules-title">
            <BookOpen aria-hidden="true" /> كيف تلعب؟
          </h2>
          <ul>
            <li>
              <QrCode aria-hidden="true" />
              <span>
                <strong>1- انضم إلى اللعبة</strong>
                <small>أدخل رمز الغرفة أو امسح QR</small>
              </span>
            </li>
            <li>
              <Hourglass aria-hidden="true" />
              <span>
                <strong>2- انتظر بدء الجولة</strong>
                <small>المضيف سيبدأ الجولة قريبًا</small>
              </span>
            </li>
            <li>
              <MousePointer2 aria-hidden="true" />
              <span>
                <strong>3- أجب بسرعة</strong>
                <small>اختر الإجابة الصحيحة</small>
              </span>
            </li>
            <li>
              <Trophy aria-hidden="true" />
              <span>
                <strong>4- اربح النقاط</strong>
                <small>الأسرع والأصح يحصل على أعلى النقاط</small>
              </span>
            </li>
          </ul>
        </aside>
      </div>
    </div>
  );
}

type DisplayPlayer = {
  id: string;
  name: string;
  score: number;
  rank: number;
  connected: boolean;
};

type DisplayRoundStats = {
  correctCount: number;
  averageResponseTimeMs: number | null;
};

const optionLetters = ['A', 'B', 'C', 'D'] as const;

function samePlayers(previous: DisplayPlayer[], next: DisplayPlayer[]) {
  return (
    previous.length === next.length &&
    previous.every((player, index) => {
      const candidate = next[index];
      return (
        candidate &&
        player.id === candidate.id &&
        player.name === candidate.name &&
        player.score === candidate.score &&
        player.rank === candidate.rank &&
        player.connected === candidate.connected
      );
    })
  );
}

function phaseLabel(phase: GamePhase) {
  if (phase === 'REVEAL') return 'كشف الإجابة';
  if (phase === 'LEADERBOARD') return 'عرض الترتيب';
  return 'مباشرة';
}

const AudienceLeaderboard = memo(
  function AudienceLeaderboard({ players }: { players: DisplayPlayer[] }) {
    return (
      <aside
        className="audience-panel audience-leaderboard"
        aria-labelledby="audience-leaderboard-title"
      >
        <h2 id="audience-leaderboard-title">
          <Trophy aria-hidden="true" /> ترتيب المتسابقين
        </h2>
        {players.length > 0 ? (
          <ol>
            {players.slice(0, 8).map((player) => (
              <li
                className={player.rank <= 3 ? `is-rank-${player.rank}` : undefined}
                key={player.id}
              >
                <b>{formatNumber(player.rank)}</b>
                <span title={player.name}>{player.name}</span>
                <strong>{formatNumber(player.score)}</strong>
                <small className={player.connected ? 'is-connected' : 'is-disconnected'}>
                  {player.connected ? <Wifi aria-hidden="true" /> : <WifiOff aria-hidden="true" />}
                  {player.connected ? 'متصل' : 'غير متصل'}
                </small>
              </li>
            ))}
          </ol>
        ) : (
          <p className="audience-empty">لا يوجد متسابقون بعد</p>
        )}
      </aside>
    );
  },
  (previous, next) => samePlayers(previous.players, next.players),
);

const AudienceQuestion = memo(
  function AudienceQuestion({
    question,
    phase,
    reveal,
    stats,
  }: {
    question: QuestionPayload;
    phase: GamePhase;
    reveal: QuestionRevealPayload | null;
    stats: QuestionStatsPayload | null;
  }) {
    const correctAnswer = reveal
      ? question.options.find((option) => option.id === reveal.correctOptionId)?.text
      : null;

    return (
      <section className="audience-question" aria-label="السؤال الحالي">
        <LiveQuestionStage
          question={question}
          phase={phase}
          reveal={reveal}
          stats={stats}
          clockOffset={0}
          className="royal-question-stage--display"
        />
        {correctAnswer && (
          <p className="audience-correct-answer" role="status">
            <CheckCircle2 aria-hidden="true" /> الإجابة الصحيحة: {correctAnswer}
          </p>
        )}
      </section>
    );
  },
  (previous, next) =>
    previous.phase === next.phase &&
    previous.question.questionId === next.question.questionId &&
    previous.question.questionEndsAt === next.question.questionEndsAt &&
    previous.reveal?.correctOptionId === next.reveal?.correctOptionId &&
    previous.stats === next.stats,
);

const LiveAnswerDistribution = memo(function LiveAnswerDistribution({
  question,
  stats,
  reveal,
}: {
  question: QuestionPayload;
  stats: QuestionStatsPayload | null;
  reveal: QuestionRevealPayload | null;
}) {
  const answered = stats?.answeredCount ?? 0;
  const total = stats?.participantCount ?? 0;
  const unanswered = Math.max(0, total - answered);
  const responseRate = total > 0 ? Math.round((answered / total) * 100) : 0;
  const values = question.options
    .slice(0, 4)
    .map((option) => stats?.options.find((item) => item.optionId === option.id)?.percentage ?? 0);
  const first = values[0] ?? 0;
  const second = first + (values[1] ?? 0);
  const third = second + (values[2] ?? 0);
  const donut =
    answered > 0
      ? `conic-gradient(#38bdf8 0 ${first}%, #f59e0b ${first}% ${second}%, #cbd5e1 ${second}% ${third}%, #fb923c ${third}% 100%)`
      : 'conic-gradient(#334155 0 100%)';

  return (
    <aside className="audience-panel audience-live-answers" aria-labelledby="audience-live-title">
      <h2 id="audience-live-title">
        <Activity aria-hidden="true" /> الإجابات المباشرة
      </h2>
      <p className="sr-only">
        أجاب {formatNumber(answered)} من {formatNumber(total)} لاعبين
      </p>
      <dl className="audience-answer-summary">
        <div>
          <dt>أجابوا</dt>
          <dd>{formatNumber(answered)}</dd>
        </div>
        <div>
          <dt>لم يجيبوا</dt>
          <dd>{formatNumber(unanswered)}</dd>
        </div>
        <div>
          <dt>نسبة الإجابة</dt>
          <dd>{formatNumber(responseRate)}٪</dd>
        </div>
      </dl>
      <ul className="audience-distribution-list">
        {question.options.slice(0, 4).map((option, index) => {
          const optionStats = stats?.options.find((item) => item.optionId === option.id);
          const percentage = optionStats?.percentage ?? 0;
          const correct = reveal?.correctOptionId === option.id;
          return (
            <li className={correct ? 'is-correct' : undefined} key={option.id}>
              <b>{optionLetters[index]}</b>
              <span title={option.text}>{option.text}</span>
              <strong>{formatNumber(optionStats?.count ?? 0)}</strong>
              <small>{formatNumber(percentage)}٪</small>
              <i
                role="progressbar"
                aria-label={`نسبة اختيار ${optionLetters[index]}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percentage}
              >
                <span style={{ inlineSize: `${percentage}%` }} />
              </i>
            </li>
          );
        })}
      </ul>
      <div
        className="audience-donut"
        style={{ background: donut }}
        role="img"
        aria-label={`إجمالي الإجابات ${formatNumber(answered)}`}
      >
        <span>
          <small>إجمالي الإجابات</small>
          <strong>{formatNumber(answered)}</strong>
        </span>
      </div>
    </aside>
  );
});

const AudienceRoundStats = memo(function AudienceRoundStats({
  stats,
  roundStats,
  revealed,
}: {
  stats: QuestionStatsPayload | null;
  roundStats: DisplayRoundStats;
  revealed: boolean;
}) {
  const answered = stats?.answeredCount ?? 0;
  const total = stats?.participantCount ?? 0;
  const correctRate = answered > 0 ? Math.round((roundStats.correctCount / answered) * 100) : 0;
  const averageSeconds =
    roundStats.averageResponseTimeMs === null ? null : roundStats.averageResponseTimeMs / 1_000;

  return (
    <section
      className="audience-panel audience-round-stats"
      aria-labelledby="audience-round-stats-title"
    >
      <h2 id="audience-round-stats-title">
        <BarChart3 aria-hidden="true" /> إحصائيات الجولة
      </h2>
      <dl>
        <div>
          <dt>الإجابات الصحيحة</dt>
          <dd>{revealed ? `${formatNumber(correctRate)}٪` : '—'}</dd>
        </div>
        <div>
          <dt>متوسط زمن الإجابة</dt>
          <dd>
            {averageSeconds === null
              ? '—'
              : `${formatNumber(averageSeconds, { maximumFractionDigits: 1 })} ث`}
          </dd>
        </div>
        <div>
          <dt>عدد الإجابات</dt>
          <dd>{formatNumber(answered)}</dd>
        </div>
        <div>
          <dt>لم يجب</dt>
          <dd>{formatNumber(Math.max(0, total - answered))}</dd>
        </div>
      </dl>
    </section>
  );
});

const AudiencePodium = memo(
  function AudiencePodium({ players }: { players: DisplayPlayer[] }) {
    const top = players.slice(0, 3);
    const ordered = [top[1], top[0], top[2]].filter((player): player is DisplayPlayer =>
      Boolean(player),
    );

    return (
      <section className="audience-panel audience-podium" aria-labelledby="audience-podium-title">
        <h2 id="audience-podium-title">أفضل ثلاثة متسابقين</h2>
        {ordered.length > 0 ? (
          <ol>
            {ordered.map((player) => (
              <li className={`is-rank-${player.rank}`} key={player.id}>
                {player.rank === 1 && <Crown aria-hidden="true" />}
                <b>{formatNumber(player.rank)}</b>
                <span title={player.name}>{player.name}</span>
                <strong>{formatNumber(player.score)}</strong>
              </li>
            ))}
          </ol>
        ) : (
          <p className="audience-empty">سيظهر المتصدرون هنا</p>
        )}
      </section>
    );
  },
  (previous, next) => samePlayers(previous.players, next.players),
);

function CompactRemaining({ question }: { question: QuestionPayload }) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const update = () => setRemaining(getQuestionRemainingMs(question.questionEndsAt, 0));
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [question.questionEndsAt]);

  return <strong>{formatNumber(Math.ceil(remaining / 1_000))} ثانية</strong>;
}

const AudienceStatus = memo(function AudienceStatus({
  phase,
  question,
  answeredCount,
  participantCount,
}: {
  phase: GamePhase;
  question: QuestionPayload;
  answeredCount: number;
  participantCount: number;
}) {
  const allAnswered = participantCount > 0 && answeredCount >= participantCount;
  return (
    <section
      className="audience-panel audience-round-status"
      aria-labelledby="audience-status-title"
    >
      <h2 id="audience-status-title">
        <Radio aria-hidden="true" /> حالة الجولة
      </h2>
      <dl>
        <div>
          <dt>الحالة</dt>
          <dd>
            <i aria-hidden="true" /> {phaseLabel(phase)}
          </dd>
        </div>
        <div>
          <dt>الإجابات المستلمة</dt>
          <dd>
            {formatNumber(answeredCount)} / {formatNumber(participantCount)}
          </dd>
        </div>
        <div>
          <dt>الوقت المتبقي</dt>
          <dd>
            {phase === 'QUESTION' ? (
              <CompactRemaining question={question} />
            ) : (
              <strong>انتهى</strong>
            )}
          </dd>
        </div>
      </dl>
      <p role="status">
        {phase === 'REVEAL'
          ? 'تم إغلاق الإجابات'
          : allAnswered
            ? 'اكتملت جميع الإجابات'
            : 'بانتظار بقية الإجابات'}
      </p>
    </section>
  );
});

export function LiveDisplayExperience({
  quizTitle,
  roomCode,
  phase,
  question,
  reveal,
  stats,
  leaderboard = [],
  questionType = 'اختيار من متعدد',
  roundStats = { correctCount: 0, averageResponseTimeMs: null },
}: {
  quizTitle: string;
  roomCode: string;
  phase: GamePhase;
  question: QuestionPayload;
  reveal: QuestionRevealPayload | null;
  stats: QuestionStatsPayload | null;
  leaderboard?: DisplayPlayer[];
  questionType?: string;
  roundStats?: DisplayRoundStats;
}) {
  const answeredCount = stats?.answeredCount ?? 0;
  const participantCount = stats?.participantCount ?? 0;

  return (
    <div
      className="royal-live royal-question-screen audience-display"
      data-room={roomCode}
      data-phase={phase}
    >
      <CompetitionStatusBar
        title={quizTitle}
        identifier={roomCode}
        status={phaseLabel(phase)}
        roundLabel={`${formatNumber(question.questionNumber)} من ${formatNumber(question.totalQuestions)}`}
        questionType={questionType}
        contestantCount={participantCount}
      />

      <div className="audience-dashboard-grid">
        <AudienceLeaderboard players={leaderboard} />
        <AudienceQuestion question={question} phase={phase} reveal={reveal} stats={stats} />
        <LiveAnswerDistribution question={question} stats={stats} reveal={reveal} />
        <AudienceRoundStats stats={stats} roundStats={roundStats} revealed={phase === 'REVEAL'} />
        <AudiencePodium players={leaderboard} />
        <AudienceStatus
          phase={phase}
          question={question}
          answeredCount={answeredCount}
          participantCount={participantCount}
        />
      </div>
    </div>
  );
}

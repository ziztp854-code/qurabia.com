'use client';

import QRCode from 'react-qr-code';
import { useEffect, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import type {
  GamePhase,
  PlayerInfo,
  QuestionPayload,
  QuestionRevealPayload,
  QuestionStatsPayload,
} from '@tahaddi/contracts';
import {
  ArrowLeft,
  BarChart3,
  Check,
  Copy,
  Crown,
  Download,
  Eye,
  Flag,
  Home,
  ListChecks,
  Menu,
  Play,
  Settings,
  SkipForward,
  Square,
  Trophy,
  UsersRound,
  Volume2,
} from 'lucide-react';
import styles from './cinematic-quiz-experience.module.css';
import { getDisplayClockState } from './display-clock';
import { useLiveGame } from './use-live-game';
import { MotionScene } from '@/components/motion/motion-scene';

export type CinematicQuizScreen =
  'host' | 'lobby' | 'question' | 'reveal' | 'leaderboard' | 'finale';

type ActionName =
  'copy-code' | 'menu' | 'sound' | 'statistics' | 'questions' | 'players' | 'settings' | 'export';

export type CinematicHostCommand = 'start' | 'next' | 'reveal' | 'finish';

export type CinematicQuizData = {
  roomCode: string;
  joinUrl: string;
  participantCount: number;
  totalQuestions: number;
  phase: GamePhase | null;
  question: QuestionPayload | null;
  reveal: QuestionRevealPayload | null;
  stats: QuestionStatsPayload | null;
  players: PlayerInfo[];
  clockOffset: number;
  connected: boolean;
  busy: boolean;
};

type Props = {
  screen: CinematicQuizScreen;
  data?: CinematicQuizData;
  onNavigate?: (screen: CinematicQuizScreen) => void;
  onAction?: (action: ActionName) => void;
  onCommand?: (command: CinematicHostCommand) => void;
};

const answers = [
  { key: 'أ', text: 'الرياض', percentage: 78 },
  { key: 'ب', text: 'جدة', percentage: 12 },
  { key: 'ج', text: 'الدمام', percentage: 6 },
  { key: 'د', text: 'المدينة المنورة', percentage: 4 },
] as const;

const players = [
  { rank: 1, name: 'أسد الجزيرة', score: 2850, initials: 'أج' },
  { rank: 2, name: 'الذئب الذهبي', score: 2420, initials: 'ذذ' },
  { rank: 3, name: 'نجمة الليل', score: 1980, initials: 'نل' },
  { rank: 4, name: 'المقاتل', score: 1560, initials: 'م' },
  { rank: 5, name: 'النسر', score: 1340, initials: 'ن' },
] as const;

const previewQuestion: QuestionPayload = {
  questionId: 'preview-question',
  prompt: 'ما عاصمة المملكة العربية السعودية؟',
  options: answers.map((answer, position) => ({
    id: `preview-${position}`,
    text: answer.text,
    position,
  })),
  media: [],
  questionStartedAt: 0,
  questionEndsAt: 15_000,
  questionNumber: 3,
  totalQuestions: 10,
};

const previewPlayers: PlayerInfo[] = players.map((player) => ({
  id: `preview-${player.rank}`,
  name: player.name,
  score: player.score,
  rank: player.rank,
  streak: 0,
}));

const previewStats: QuestionStatsPayload = {
  questionId: previewQuestion.questionId,
  answeredCount: 28,
  participantCount: 28,
  options: previewQuestion.options.map((option, index) => ({
    optionId: option.id,
    count: [22, 3, 2, 1][index] ?? 0,
    percentage: answers[index]?.percentage ?? 0,
  })),
};

const defaultData: CinematicQuizData = {
  roomCode: '7X9K2',
  joinUrl: 'https://qurabia.com/join/7X9K2',
  participantCount: 28,
  totalQuestions: 10,
  phase: null,
  question: previewQuestion,
  reveal: {
    questionId: previewQuestion.questionId,
    correctOptionId: previewQuestion.options[0]?.id ?? '',
    explanation: null,
    stats: previewStats,
  },
  stats: previewStats,
  players: previewPlayers,
  clockOffset: 0,
  connected: true,
  busy: false,
};

function Brand() {
  return (
    <div className={styles.brand} aria-label="تحدّي">
      <Crown aria-hidden="true" />
      <strong>تحدّي</strong>
    </div>
  );
}

function LiveBadge() {
  return (
    <span className={styles.liveBadge}>
      <i aria-hidden="true" />
      مباشر
    </span>
  );
}

function Crest({ small = false }: { small?: boolean }) {
  return <span className={small ? styles.crestSmall : styles.crest} aria-hidden="true" />;
}

function Stage({ screen, children }: { screen: CinematicQuizScreen; children: React.ReactNode }) {
  const scene =
    screen === 'finale'
      ? styles.finaleStage
      : screen === 'question' || screen === 'reveal'
        ? styles.questionStage
        : styles.arenaStage;
  return <div className={`${styles.stage} ${scene}`}>{children}</div>;
}

function HostScreen({
  data,
  onNavigate,
  onAction,
  onCommand,
}: Required<Pick<Props, 'data'>> & Pick<Props, 'onNavigate' | 'onAction' | 'onCommand'>) {
  const tools: Array<[ComponentType<{ 'aria-hidden'?: boolean }>, string, ActionName]> = [
    [Volume2, 'الصوت', 'sound'],
    [BarChart3, 'الإحصاءات', 'statistics'],
    [ListChecks, 'قائمة الأسئلة', 'questions'],
    [UsersRound, 'إدارة اللاعبين', 'players'],
    [Settings, 'الإعدادات', 'settings'],
  ];

  return (
    <div className={styles.hostScreen}>
      <header className={styles.hostHeader}>
        <Brand />
        <h1>
          <span />
          لوحة المضيف
          <span />
        </h1>
        <div className={styles.headerControls}>
          <LiveBadge />
          <button aria-label="القائمة" onClick={() => onAction?.('menu')} type="button">
            <Menu />
          </button>
        </div>
      </header>
      <main className={styles.hostBody}>
        <dl className={styles.statsColumn}>
          <div>
            <dt>رمز الغرفة</dt>
            <dd dir="ltr">
              {data.roomCode} <Copy />
            </dd>
          </div>
          <div>
            <dt>حالة البث</dt>
            <dd className={styles.cyan}>
              <i />
              {data.connected ? 'مباشر' : 'إعادة اتصال'}
            </dd>
          </div>
          <div>
            <dt>اللاعبون الآن</dt>
            <dd>
              <UsersRound />
              {data.participantCount} <small>/ 100</small>
            </dd>
          </div>
          <div>
            <dt>الجولة</dt>
            <dd>
              <Flag />
              {data.question?.questionNumber ?? 0} <small>/ {data.totalQuestions}</small>
            </dd>
          </div>
        </dl>
        <div className={styles.hostHero}>
          <div className={styles.hostQrCard}>
            <QRCode
              aria-label={`رمز QR للانضمام إلى الغرفة ${data.roomCode}`}
              bgColor="#fff"
              fgColor="#05090c"
              level="M"
              role="img"
              size={128}
              value={data.joinUrl}
            />
          </div>
          <div className={styles.hostInviteInfo}>
            <strong dir="ltr">{data.roomCode}</strong>
            <span dir="ltr" className={styles.hostInviteUrl}>{data.joinUrl}</span>
            <div className={styles.hostInviteActions}>
              <button type="button" onClick={() => onAction?.('copy-code')}>
                <Copy aria-hidden={true} />
                نسخ الرمز
              </button>
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(data.joinUrl)}
              >
                <Copy aria-hidden={true} />
                نسخ الرابط
              </button>
            </div>
          </div>
        </div>
        <div className={styles.hostActions}>
          <button
            className={styles.goldButton}
            disabled={data.phase !== null && (data.phase !== 'LOBBY' || data.busy)}
            onClick={() => {
              onCommand?.('start');
              if (!onCommand) onNavigate?.('question');
            }}
            type="button"
          >
            <Play />
            بدء الجولة
          </button>
          <button
            disabled={
              data.phase !== null && (!['REVEAL', 'LEADERBOARD'].includes(data.phase) || data.busy)
            }
            onClick={() => {
              onCommand?.('next');
              if (!onCommand) onNavigate?.('question');
            }}
            type="button"
          >
            <SkipForward />
            السؤال التالي
          </button>
          <button
            disabled={
              data.phase !== null && (data.phase !== 'QUESTION' || data.busy || !data.question)
            }
            onClick={() => {
              onCommand?.('reveal');
              if (!onCommand) onNavigate?.('reveal');
            }}
            type="button"
          >
            <Eye />
            كشف الإجابة
          </button>
          <button
            className={styles.endButton}
            disabled={data.phase === 'FINISHED' || data.busy}
            onClick={() => {
              onCommand?.('finish');
              if (!onCommand) onNavigate?.('finale');
            }}
            type="button"
          >
            <Square />
            إنهاء الجولة
          </button>
        </div>
      </main>
      <nav className={styles.hostToolbar} aria-label="أدوات المضيف">
        {tools.map(([Icon, label, action]) => (
          <button key={action} onClick={() => onAction?.(action)} type="button">
            <Icon aria-hidden={true} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function LobbyScreen({ data, onAction }: Required<Pick<Props, 'data'>> & Pick<Props, 'onAction'>) {
  return (
    <div className={styles.lobbyScreen}>
      <Crest small />
      <h1>انضم إلى التحدّي</h1>
      <p>امسح الرمز أو أدخل رمز الغرفة</p>
      <div className={styles.inviteRow}>
        <button
          className={styles.codeCard}
          onClick={() => onAction?.('copy-code')}
          type="button"
          aria-label={`نسخ رمز الغرفة ${data.roomCode}`}
        >
          <strong dir="ltr">{data.roomCode}</strong>
          <Copy />
        </button>
        <div className={styles.qrCard}>
          <QRCode
            aria-label={`رمز QR للانضمام إلى الغرفة ${data.roomCode}`}
            bgColor="#fff"
            fgColor="#05090c"
            level="M"
            role="img"
            size={220}
            value={data.joinUrl}
          />
          <Crest small />
        </div>
      </div>
      <div className={styles.joinedCount}>
        <strong>{data.participantCount}</strong>
        <span>لاعبًا انضموا</span>
      </div>
      <div className={styles.waiting}>
        <span>بانتظار بدء الجولة</span>
        <i aria-hidden="true" />
      </div>
    </div>
  );
}

function QuestionHeader({
  numbered = false,
  questionNumber = 0,
  onNavigate,
}: {
  numbered?: boolean;
  questionNumber?: number;
  onNavigate?: Props['onNavigate'];
}) {
  return (
    <header className={styles.questionHeader}>
      {numbered ? (
        <span className={styles.questionNumber}>
          <b>{questionNumber}</b>السؤال
        </span>
      ) : onNavigate ? (
        <button onClick={() => onNavigate('host')} type="button">
          <ArrowLeft />
          العودة للوحة
        </button>
      ) : (
        <span aria-hidden="true" />
      )}
      <Brand />
      <LiveBadge />
    </header>
  );
}

function optionLetter(position: number) {
  return ['أ', 'ب', 'ج', 'د', 'هـ', 'و'][position] ?? String(position + 1);
}

function LiveTimer({ question, clockOffset }: { question: QuestionPayload; clockOffset: number }) {
  const [now, setNow] = useState(Date.now);
  // Broadcast screens have no socket clock sync; prefer the HTTP tick offset
  // measured by RoomPoller when it is available.
  const displayClock = getDisplayClockState();
  const effectiveOffset = displayClock.ready ? displayClock.offset : clockOffset;
  const remaining =
    question.questionStartedAt === 0
      ? Math.max(0, Math.ceil((question.questionEndsAt - question.questionStartedAt) / 1_000))
      : Math.max(0, Math.ceil((question.questionEndsAt - (now + effectiveOffset)) / 1_000));

  useEffect(() => {
    if (question.questionStartedAt === 0) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [question.questionStartedAt]);

  return (
    <div className={styles.timer}>
      <strong>{remaining}</strong>
      <span>ثانية</span>
    </div>
  );
}

function AnswerGrid({
  question,
  reveal,
}: {
  question: QuestionPayload;
  reveal: QuestionRevealPayload | null;
}) {
  return (
    <div className={styles.answerGrid}>
      {question.options.map((option) => (
        <div
          className={reveal?.correctOptionId === option.id ? styles.correctChoice : undefined}
          key={option.id}
        >
          <strong>{option.text}</strong>
          <span>{optionLetter(option.position)}</span>
          {reveal?.correctOptionId === option.id ? <Crown aria-hidden="true" /> : null}
        </div>
      ))}
    </div>
  );
}

function QuestionScreen({
  data,
  reveal = false,
  onNavigate,
}: Required<Pick<Props, 'data'>> & { reveal?: boolean; onNavigate?: Props['onNavigate'] }) {
  const question = data.question;
  const revealData = reveal ? (data.reveal ?? null) : null;
  return (
    <div className={reveal ? styles.revealScreen : styles.questionScreen}>
      <QuestionHeader
        numbered={reveal}
        questionNumber={question?.questionNumber ?? 0}
        onNavigate={onNavigate}
      />
      {question ? (
        <div className={styles.questionMain}>
          <h1>{question.prompt}</h1>
          <LiveTimer question={question} clockOffset={data.clockOffset} />
          <AnswerGrid question={question} reveal={revealData} />
        </div>
      ) : (
        <div className={styles.questionMain}>
          <p className={styles.stageNote}>بانتظار السؤال المباشر…</p>
        </div>
      )}
      {reveal ? (
        question && revealData ? (
          <RevealPanel data={data} question={question} />
        ) : (
          <p className={styles.stageNote}>بانتظار كشف الإجابة…</p>
        )
      ) : null}
    </div>
  );
}

function RevealPanel({ data, question }: { data: CinematicQuizData; question: QuestionPayload }) {
  const reveal = data.reveal;
  const stats = data.stats ?? reveal?.stats ?? null;
  if (!reveal || !stats) return null;
  const correctOption = question.options.find((option) => option.id === reveal.correctOptionId);
  return (
    <section className={styles.revealPanel} aria-label="نتائج الإجابة">
      <h2>كشف الإجابة</h2>
      <div className={styles.revealContent}>
        <div className={styles.bars}>
          {question.options.map((option) => {
            const optionStats = stats.options.find((item) => item.optionId === option.id);
            const percentage = optionStats?.percentage ?? 0;
            return (
              <div key={option.id}>
                <span>{option.text}</span>
                <i>
                  <b style={{ width: `${percentage}%` }} />
                </i>
                <strong>{percentage}٪</strong>
              </div>
            );
          })}
        </div>
        <div className={styles.correctCard}>
          <small>الإجابة الصحيحة</small>
          <Check />
          <strong>{correctOption?.text ?? '—'}</strong>
          <Crown />
        </div>
      </div>
      <div className={styles.answerProgress}>
        <span>
          تقدم الإجابات{' '}
          <b>
            {stats.answeredCount} / {stats.participantCount}
          </b>
        </span>
        <i
          role="progressbar"
          aria-label="تقدم الإجابات"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={
            stats.participantCount
              ? Math.round((stats.answeredCount / stats.participantCount) * 100)
              : 0
          }
        >
          <b
            style={{
              width: `${stats.participantCount ? Math.round((stats.answeredCount / stats.participantCount) * 100) : 0}%`,
            }}
          />
        </i>
        <strong>
          {stats.participantCount
            ? Math.round((stats.answeredCount / stats.participantCount) * 100)
            : 0}
          ٪
        </strong>
      </div>
    </section>
  );
}

function PlayerMark({ initials, rank }: { initials: string; rank: number }) {
  return <span className={`${styles.playerMark} ${styles[`rank${rank}`]}`}>{initials}</span>;
}

function playerInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
}

function LeaderboardScreen({
  data,
  onNavigate,
  onAction,
}: Required<Pick<Props, 'data'>> & Pick<Props, 'onNavigate' | 'onAction'>) {
  const rankedPlayers = [...data.players].sort((left, right) => left.rank - right.rank);
  return (
    <div className={styles.leaderboardScreen}>
      <header className={styles.boardHeader}>
        <button aria-label="العودة" onClick={() => onNavigate?.('reveal')} type="button">
          <ArrowLeft />
        </button>
        <Brand />
        <div>
          <LiveBadge />
          <Crest small />
        </div>
      </header>
      <h1>
        <span />
        الترتيب
        <span />
      </h1>
      <section className={styles.boardPanel}>
        <nav className={styles.boardTabs} aria-label="نطاق الترتيب">
          <button className={styles.activeTab}>الكل</button>
          <button>هذا السؤال</button>
          <button>الجولة</button>
        </nav>
        <div className={styles.tableHead}>
          <span>#</span>
          <span>اللاعب</span>
          <span>النقاط</span>
        </div>
        <ol>
          {rankedPlayers.map((player) => (
            <li key={player.id} className={styles[`row${player.rank}`]}>
              <b>
                {player.rank <= 3 ? <Crown aria-label={`المركز ${player.rank}`} /> : player.rank}
              </b>
              <PlayerMark initials={playerInitials(player.name)} rank={player.rank} />
              <strong>{player.name}</strong>
              <span>{player.score}</span>
              <Trophy aria-hidden="true" />
            </li>
          ))}
        </ol>
        <footer>
          <button onClick={() => onAction?.('export')} type="button">
            <Download />
            تصدير النتائج
          </button>
          <span>
            <UsersRound />
            {data.participantCount} لاعبًا
          </span>
        </footer>
      </section>
      <Crest small />
    </div>
  );
}

function FinaleScreen({
  data,
  onNavigate,
}: Required<Pick<Props, 'data'>> & Pick<Props, 'onNavigate'>) {
  const winners = [...data.players].sort((left, right) => left.rank - right.rank).slice(0, 3);
  const byRank = (rank: number) => winners.find((player) => player.rank === rank);
  const podium = [2, 1, 3].map(
    (rank) => byRank(rank) ?? { id: `empty-${rank}`, name: '—', score: 0, rank, streak: 0 },
  );
  return (
    <div className={styles.finaleScreen}>
      <header>
        <button onClick={() => onNavigate?.('host')} type="button">
          <Home />
          الرئيسية
        </button>
        <Brand />
        <LiveBadge />
      </header>
      <div className={styles.finaleCrest}>
        <Crest />
      </div>
      <ol className={styles.podium}>
        {podium.map((player) => (
          <li className={styles[`place${player.rank}`]} key={player.id}>
            <PlayerMark initials={playerInitials(player.name)} rank={player.rank} />
            <strong>{player.name}</strong>
            <b>{player.score}</b>
            <span>{player.rank}</span>
          </li>
        ))}
      </ol>
      <button className={styles.finishButton} onClick={() => onNavigate?.('host')} type="button">
        إنهاء اللعبة
        <Trophy />
      </button>
    </div>
  );
}

const labels: Record<CinematicQuizScreen, string> = {
  host: 'لوحة المضيف',
  lobby: 'بانتظار اللاعبين',
  question: 'السؤال المباشر',
  reveal: 'كشف الإجابة',
  leaderboard: 'الترتيب',
  finale: 'التتويج',
};

export function CinematicQuizExperience({ screen, data, onNavigate, onAction, onCommand }: Props) {
  const resolvedData = data ?? defaultData;
  const scene = screen === 'lobby' ? 'intro' : screen === 'finale' ? 'finished' : screen === 'reveal' || screen === 'leaderboard' ? 'reveal' : 'question';
  return (
    <MotionScene scene={scene} sceneKey={screen}>
      <section
        className={styles.cinema}
        data-screen={screen}
        role="region"
        aria-label={labels[screen]}
      >
        <Stage screen={screen}>
        {screen === 'host' ? (
          <HostScreen
            data={resolvedData}
            onNavigate={onNavigate}
            onAction={onAction}
            onCommand={onCommand}
          />
        ) : null}
        {screen === 'lobby' ? <LobbyScreen data={resolvedData} onAction={onAction} /> : null}
        {screen === 'question' ? (
          <QuestionScreen data={resolvedData} onNavigate={onNavigate} />
        ) : null}
        {screen === 'reveal' ? (
          <QuestionScreen data={resolvedData} reveal onNavigate={onNavigate} />
        ) : null}
        {screen === 'leaderboard' ? (
          <LeaderboardScreen data={resolvedData} onNavigate={onNavigate} onAction={onAction} />
        ) : null}
        {screen === 'finale' ? <FinaleScreen data={resolvedData} onNavigate={onNavigate} /> : null}
        </Stage>
      </section>
    </MotionScene>
  );
}

export function CinematicQuizPreview({ initialScreen }: { initialScreen: CinematicQuizScreen }) {
  const [screen, setScreen] = useState(initialScreen);
  const [message, setMessage] = useState('');

  const handleAction = (action: ActionName) => {
    const messages: Record<ActionName, string> = {
      'copy-code': 'تم نسخ رمز الغرفة',
      menu: 'معاينة قائمة المضيف',
      sound: 'تم تبديل الصوت في المعاينة',
      statistics: 'معاينة الإحصاءات',
      questions: 'معاينة قائمة الأسئلة',
      players: 'معاينة إدارة اللاعبين',
      settings: 'معاينة الإعدادات',
      export: 'تم تجهيز تصدير النتائج في المعاينة',
    };
    setMessage(messages[action]);
    if (action === 'copy-code') void navigator.clipboard?.writeText(defaultData.roomCode);
  };

  return (
    <>
      <CinematicQuizExperience screen={screen} onNavigate={setScreen} onAction={handleAction} />
      {message ? <output className={styles.previewToast}>{message}</output> : null}
    </>
  );
}

type HostQuestion = {
  question: { id: string; prompt: string };
};

export function CinematicLiveHostExperience({
  sessionId,
  hostId,
  accessToken,
  roomCode,
  joinUrl,
  initialAutoAdvance,
  totalQuestions,
  questions = [],
}: {
  sessionId: string;
  hostId: string;
  accessToken: string;
  roomCode: string;
  joinUrl: string;
  initialAutoAdvance: boolean;
  quizTitle?: string;
  totalQuestions: number;
  questions?: HostQuestion[];
}) {
  const game = useLiveGame({ sessionId, subjectId: hostId, accessToken, role: 'host' });
  const [view, setView] = useState<{ phase: GamePhase | null; screen: CinematicQuizScreen } | null>(
    null,
  );
  const [panel, setPanel] = useState<ActionName | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [autoAdvance, setAutoAdvance] = useState(initialAutoAdvance);
  const autoAdvancedQuestion = useRef<string | null>(null);
  const nextQuestionRef = useRef(game.nextQuestion);

  useEffect(() => {
    nextQuestionRef.current = game.nextQuestion;
  }, [game.nextQuestion]);

  useEffect(() => {
    const questionId = game.snapshot?.question?.questionId;
    if (!autoAdvance || game.snapshot?.phase !== 'REVEAL' || !questionId) return;
    if (autoAdvancedQuestion.current === questionId) return;
    const timer = window.setTimeout(() => {
      autoAdvancedQuestion.current = questionId;
      nextQuestionRef.current();
    }, 2_000);
    return () => window.clearTimeout(timer);
  }, [autoAdvance, game.snapshot?.phase, game.snapshot?.question?.questionId]);

  const data: CinematicQuizData = {
    roomCode,
    joinUrl,
    participantCount: game.snapshot?.participantCount ?? 0,
    totalQuestions: totalQuestions || game.snapshot?.question?.totalQuestions || 0,
    phase: game.snapshot?.phase ?? null,
    question: game.snapshot?.question ?? null,
    reveal: game.snapshot?.reveal ?? null,
    stats: game.stats,
    players: game.snapshot?.leaderboard ?? [],
    clockOffset: game.clockOffset,
    connected: game.connected,
    busy: game.busy,
  };
  const phaseScreen: Partial<Record<GamePhase, CinematicQuizScreen>> = {
    LOBBY: 'host',
    QUESTION: 'question',
    REVEAL: 'reveal',
    LEADERBOARD: 'leaderboard',
    FINISHED: 'finale',
  };
  const screen =
    view?.phase === data.phase
      ? view.screen
      : data.phase
        ? (phaseScreen[data.phase] ?? 'host')
        : 'host';
  const navigate = (nextScreen: CinematicQuizScreen) =>
    setView({ phase: data.phase, screen: nextScreen });

  const handleCommand = (command: CinematicHostCommand) => {
    if (command === 'start') game.startQuestion();
    if (command === 'next') game.nextQuestion();
    if (command === 'reveal' && data.question) game.revealQuestion(data.question.questionId);
    if (command === 'finish') game.finishGame();
  };

  const exportResults = () => {
    const rows = [
      ['الترتيب', 'اللاعب', 'النقاط'],
      ...data.players.map((player) => [player.rank, player.name, player.score]),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `tahaddi-${roomCode}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleAction = (action: ActionName) => {
    if (action === 'copy-code') void navigator.clipboard?.writeText(roomCode);
    else if (action === 'sound') setSoundEnabled((value) => !value);
    else if (action === 'export') exportResults();
    else setPanel(action);
  };

  return (
    <div className={styles.liveController}>
      <CinematicQuizExperience
        screen={screen}
        data={data}
        onNavigate={navigate}
        onAction={handleAction}
        onCommand={handleCommand}
      />
      {panel ? (
        <aside className={styles.controlPanel} aria-label="لوحة أدوات المضيف">
          <button aria-label="إغلاق لوحة الأدوات" onClick={() => setPanel(null)} type="button">
            ×
          </button>
          <h2>
            {panel === 'statistics'
              ? 'الإحصاءات'
              : panel === 'questions'
                ? 'قائمة الأسئلة'
                : panel === 'players'
                  ? 'إدارة اللاعبين'
                  : panel === 'settings'
                    ? 'الإعدادات'
                    : 'قائمة المضيف'}
          </h2>
          {panel === 'statistics' ? (
            <dl>
              <div>
                <dt>اللاعبون</dt>
                <dd>{data.participantCount}</dd>
              </div>
              <div>
                <dt>الإجابات</dt>
                <dd>{game.stats?.answeredCount ?? 0}</dd>
              </div>
            </dl>
          ) : null}
          {panel === 'questions' ? (
            <ol>
              {questions.map((item, index) => (
                <li key={item.question.id}>
                  <span>{index + 1}</span>
                  {item.question.prompt}
                </li>
              ))}
            </ol>
          ) : null}
          {panel === 'players' ? (
            <ol>
              {data.players.map((player) => (
                <li key={player.id}>
                  <span>{player.rank}</span>
                  {player.name}
                  <b>{player.score}</b>
                </li>
              ))}
            </ol>
          ) : null}
          {panel === 'settings' ? (
            <label>
              <input
                checked={autoAdvance}
                onChange={(event) => setAutoAdvance(event.target.checked)}
                type="checkbox"
              />
              الانتقال التلقائي بعد كشف الإجابة
            </label>
          ) : null}
          {panel === 'menu' ? (
            <nav>
              {(['host', 'lobby', 'question', 'reveal', 'leaderboard', 'finale'] as const).map(
                (nextScreen) => (
                  <button
                    key={nextScreen}
                    onClick={() => {
                      navigate(nextScreen);
                      setPanel(null);
                    }}
                    type="button"
                  >
                    {labels[nextScreen]}
                  </button>
                ),
              )}
            </nav>
          ) : null}
          <p>{soundEnabled ? 'الصوت مفعّل' : 'الصوت متوقف'}</p>
        </aside>
      ) : null}
      {game.message ? <output className={styles.previewToast}>{game.message}</output> : null}
    </div>
  );
}

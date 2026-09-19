'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Check,
  Copy,
  Crown,
  Maximize2,
  Minimize2,
  Play,
  ScrollText,
  Swords,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { Button, ButtonLink, Card, Dialog, Input } from '@/components/ui';
import { MotionScene } from '@/components/motion/motion-scene';
import { getGameMotionScene } from '@/lib/motion';
import { INSTANT_GAME_META, difficultyForRound } from '@tahaddi/domain';
import type { EliminationRoomSnapshot } from '@tahaddi/contracts';
import { formatNumber } from '@/lib/utils';
import { useEliminationSocket } from './use-elimination-socket';
import {
  EliminationBoard,
  eliminationDifficultyLabel,
  formatRemainingClock,
} from './elimination-board';
import styles from './elimination-room.module.css';
import {
  clearEliminationGuestIdentity,
  getOrCreateEliminationGuestId,
  getOrCreateEliminationGuestToken,
  isEliminationSessionStorageAvailable,
} from './elimination-session-storage';

type Phase = 'join' | 'waiting' | 'countdown' | 'play' | 'verdict' | 'finished';
type GuestIdentity = { guestId: string; guestToken: string };
type HostIdentity = { hostId: string; accessToken: string };

const ROUND_TIME_OPTIONS = [10, 15, 20, 30, 45, 60, 90];
const LADDER_STAGES = ['مبتدئ', 'متوسط', 'متقدّم', 'النهائي'] as const;

function loadInitialIdentity(): GuestIdentity {
  if (!isEliminationSessionStorageAvailable()) {
    return { guestId: '', guestToken: '' };
  }
  return {
    guestId: getOrCreateEliminationGuestId(),
    guestToken: getOrCreateEliminationGuestToken(),
  };
}

const EMPTY_IDENTITY: GuestIdentity = { guestId: '', guestToken: '' };

function emptyIdentity(): GuestIdentity {
  return EMPTY_IDENTITY;
}

function subscribeNoop() {
  return () => undefined;
}

let cachedStoredIdentity: GuestIdentity | null = null;

function readStoredIdentity(): GuestIdentity {
  const next = loadInitialIdentity();
  if (
    cachedStoredIdentity &&
    cachedStoredIdentity.guestId === next.guestId &&
    cachedStoredIdentity.guestToken === next.guestToken
  ) {
    return cachedStoredIdentity;
  }
  cachedStoredIdentity = next;
  return next;
}

function useCountdown(remainingSeconds: number | null): number | null {
  const [seconds, setSeconds] = useState<number | null>(remainingSeconds);
  const [lastRemaining, setLastRemaining] = useState(remainingSeconds);

  if (remainingSeconds !== lastRemaining) {
    setLastRemaining(remainingSeconds);
    setSeconds(remainingSeconds);
  }

  useEffect(() => {
    if (seconds == null || seconds <= 0) return undefined;
    const interval = window.setInterval(() => {
      setSeconds((current) => (current == null ? null : Math.max(0, current - 1)));
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [seconds]);
  return seconds;
}

const RULES = [
  'يبدأ الجميع معًا، وسؤال واحد في كل جولة.',
  'كل من يخطئ — أو ينتهي وقته دون إجابة — يُقصى فورًا.',
  'الأسئلة تتصاعد صعوبة: مبتدئ ثم متوسط ثم متقدّم.',
  'الناجي الأخير وحده يرتفع إلى المنصة.',
];

export function EliminationRoom({
  initialRoomCode,
  role = 'player',
  hostIdentity,
  hostName,
}: {
  initialRoomCode?: string;
  role?: 'player' | 'host';
  hostIdentity?: HostIdentity;
  hostName?: string;
}) {
  const meta = INSTANT_GAME_META['elimination-live'];
  const reduceMotion = useReducedMotion();
  const storageProbeReady = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

  const storedIdentity = useSyncExternalStore(
    subscribeNoop,
    readStoredIdentity,
    emptyIdentity,
  );
  const [recoveredIdentity, setIdentity] = useState<GuestIdentity | null>(null);
  const identity = recoveredIdentity ?? storedIdentity;
  const storageAvailable =
    identity.guestId.length > 0 && identity.guestToken.length > 0;
  const guestIdentityKey = storageAvailable
    ? `${identity.guestId}::${identity.guestToken}`
    : '';

  const {
    connected,
    room,
    error,
    busy,
    gameEnd,
    countdown,
    setError,
    setBusy,
    socketRef,
    clearRoom,
    guestIdentityInvalid,
  } = useEliminationSocket(
    role === 'player' ? identity.guestId || undefined : undefined,
    role === 'player' ? identity.guestToken || undefined : undefined,
    role === 'host' ? hostIdentity : undefined,
  );

  const [playerName, setPlayerName] = useState('');
  const [totalRounds, setTotalRounds] = useState(5);
  const [roundTimeLimit, setRoundTimeLimit] = useState(20);
  const [copied, setCopied] = useState(false);
  const [submittedThisAttempt, setSubmittedThisAttempt] = useState(false);
  const [joinCode, setJoinCode] = useState(
    () => initialRoomCode?.toUpperCase() ?? '',
  );
  const [rulesOpen, setRulesOpen] = useState(false);
  const [playersOpen, setPlayersOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const roomCode = room?.roomCode ?? joinCode;
  const identityBlocked =
    role === 'host' ? !hostIdentity : guestIdentityInvalid || !guestIdentityKey;

  const phase: Phase = useMemo(() => {
    if (!room) return 'join';
    if (room.phase === 'active') return countdown ? 'countdown' : 'play';
    if (room.phase === 'between') return 'verdict';
    if (room.phase === 'waiting') {
      return room.currentRound > 0 ? 'verdict' : 'waiting';
    }
    if (room.phase === 'finished') return 'finished';
    return 'join';
  }, [room, countdown]);

  const isHost = room?.isHost ?? false;
  const remaining = useCountdown(room?.remainingSeconds ?? null);
  const currentQuestion = room?.currentQuestion ?? null;
  const lastResult = room?.lastRoundResult ?? null;

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    void document.documentElement.requestFullscreen().catch(() => undefined);
  }, []);

  const handleHost = () => {
    if (!socketRef.current) return;
    setBusy(true);
    setError('');
    socketRef.current.emit('elimination:host', {
      totalRounds,
      roundTimeLimit,
    });
  };

  const handleJoin = () => {
    if (!socketRef.current || !roomCode) return;
    setBusy(true);
    setError('');
    socketRef.current.emit('elimination:join', {
      roomCode: roomCode.toUpperCase(),
      playerName: playerName.trim(),
    });
  };

  const handleStart = () => {
    if (!socketRef.current || !roomCode) return;
    setBusy(true);
    setError('');
    socketRef.current.emit('elimination:start', {
      roomCode: roomCode.toUpperCase(),
    });
  };

  const handleNext = () => {
    if (!socketRef.current || !roomCode) return;
    setBusy(true);
    setError('');
    socketRef.current.emit('elimination:next', { roomCode: roomCode.toUpperCase() });
  };

  const handleEndRound = () => {
    if (!socketRef.current || !roomCode) return;
    setBusy(true);
    setError('');
    socketRef.current.emit('elimination:round:end', {
      roomCode: roomCode.toUpperCase(),
    });
  };

  const handleFinishGame = () => {
    if (!socketRef.current || !roomCode) return;
    setBusy(true);
    setError('');
    socketRef.current.emit('elimination:game:finish', {
      roomCode: roomCode.toUpperCase(),
    });
  };

  const handleSelectOption = (optionIndex: number) => {
    if (!socketRef.current || !room?.currentQuestion || !roomCode) return;
    if (submittedThisAttempt || busy || room.myAnswer != null) return;
    setSubmittedThisAttempt(true);
    setBusy(true);
    socketRef.current.emit('elimination:answer:submit', {
      roomCode: roomCode.toUpperCase(),
      questionId: room.currentQuestion.id,
      optionIndex,
      submissionId: `el-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    });
    window.setTimeout(() => setSubmittedThisAttempt(false), 600);
  };

  const handleLeave = () => {
    if (!socketRef.current || !roomCode) return;
    socketRef.current.emit('elimination:leave', { roomCode: roomCode.toUpperCase() });
    setPlayersOpen(false);
    clearRoom();
  };

  const handleRecoverGuest = useCallback(() => {
    clearEliminationGuestIdentity();
    cachedStoredIdentity = null;
    setIdentity(loadInitialIdentity());
  }, []);

  const shareUrl = useMemo(() => {
    if (!room || typeof window === 'undefined') return '';
    return `${window.location.origin}/games/elimination-live/join/${room.roomCode}`;
  }, [room]);

  const copyInvite = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  };

  const alivePlayers = useMemo(
    () => (room ? room.players.filter((player) => player.alive) : []),
    [room],
  );
  const eliminatedPlayers = useMemo(
    () => (room ? room.players.filter((player) => !player.alive) : []),
    [room],
  );
  const viewerPlayer = room?.players.find((player) => player.isViewer) ?? null;
  const viewerAlive = viewerPlayer?.alive ?? false;
  const viewerEliminatedThisRound =
    phase === 'verdict' &&
    !viewerAlive &&
    Boolean(lastResult?.eliminatedIds.includes(viewerPlayer?.id ?? ''));
  const viewerTimedOut =
    viewerEliminatedThisRound && viewerPlayer?.hasAnswered === false;

  const difficultyNow = room
    ? difficultyForRound(Math.max(1, room.currentRound), room.totalRounds)
    : 'EASY';
  const nextDifficulty =
    room && lastResult && room.phase === 'between'
      ? difficultyForRound(Math.min(room.totalRounds, room.currentRound + 1), room.totalRounds)
      : null;
  const isFinalStage =
    room != null &&
    (room.currentRound >= room.totalRounds || room.aliveCount <= 2);
  const ladderStage =
    isFinalStage ? 3 : difficultyNow === 'EASY' ? 0 : difficultyNow === 'MEDIUM' ? 1 : 2;
  const showLadder = phase === 'play' || phase === 'verdict';

  const timerRatio =
    room && currentQuestion && remaining != null
      ? remaining / currentQuestion.timeLimit
      : null;
  const timeLabel = remaining == null ? '--:--' : formatRemainingClock(remaining);
  const roundLabel = room
    ? `الجولة ${formatNumber(room.currentRound)} من ${formatNumber(room.totalRounds)}`
    : '';

  const rosterList = (players: EliminationRoomSnapshot['players']) =>
    players.map((player) => (
      <li
        key={player.id}
        className={
          player.alive
            ? styles.elrPlayerItem
            : `${styles.elrPlayerItem} ${styles.elrPlayerOut}`
        }
        data-viewer={player.isViewer || undefined}
      >
        <span className={styles.elrPlayerAvatar} aria-hidden="true">
          {player.name.slice(0, 1)}
        </span>
        <span className={styles.elrPlayerName}>{player.name}</span>
        {player.alive ? (
          player.hasAnswered ? (
            <span className={`${styles.elrStatePill} ${styles.elrStateAnswered}`}>
              <Check size={12} aria-hidden="true" /> أجاب
            </span>
          ) : (
            <span className={`${styles.elrStatePill} ${styles.elrStateActive}`}>
              نشط
            </span>
          )
        ) : (
          <span className={`${styles.elrStatePill} ${styles.elrStateOut}`}>
            <X size={12} aria-hidden="true" /> مُقصى
          </span>
        )}
      </li>
    ));

  return (
    <MotionScene scene={getGameMotionScene(phase)} sceneKey={phase}>
      <section className={styles.elrRoom} dir="rtl">
      <div className={styles.elrBackdrop} aria-hidden="true" />

      <div className={styles.elrShell}>
        {/* ═══ الترويسة ═══ */}
        <header className={styles.elrHeader}>
          <div className={styles.elrHeaderBrand}>
            <span className={styles.elrBrandmark} aria-hidden="true">
              <Swords size={20} strokeWidth={2.4} />
            </span>
            <div className={styles.elrHeaderText}>
              <h1 className={styles.elrTitle}>حلقة الإقصاء</h1>
              <p className={styles.elrSubtitle}>
                سؤال واحد في كل جولة، والخطأ يعني الإقصاء
              </p>
            </div>
          </div>

          <div className={styles.elrHeaderMeta}>
            {room && (
              <>
                <span className={styles.elrMetaPill}>
                  <span className={styles.elrMetaLabel}>الجولة</span>
                  <strong className="num">
                    {formatNumber(room.currentRound)}/{formatNumber(room.totalRounds)}
                  </strong>
                </span>
                <span
                  className={styles.elrMetaPill}
                  data-difficulty={difficultyNow.toLowerCase()}
                >
                  <span className={styles.elrMetaLabel}>الصعوبة</span>
                  <strong>{eliminationDifficultyLabel(difficultyNow)}</strong>
                </span>
                <span className={styles.elrMetaPill}>
                  <span className={styles.elrMetaLabel}>الناجون</span>
                  <strong className="num">{formatNumber(room.aliveCount)}</strong>
                </span>
              </>
            )}
          </div>

          <div className={styles.elrHeaderActions}>
            <button
              type="button"
              className={styles.elrIconButton}
              aria-label="قوانين الحلقة"
              onClick={() => setRulesOpen(true)}
            >
              <ScrollText size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={styles.elrIconButton}
              aria-label={isFullscreen ? 'الخروج من ملء الشاشة' : 'ملء الشاشة'}
              onClick={toggleFullscreen}
            >
              {isFullscreen ? (
                <Minimize2 size={18} aria-hidden="true" />
              ) : (
                <Maximize2 size={18} aria-hidden="true" />
              )}
            </button>
          </div>
        </header>

        {/* ═══ شريط مراحل الصعوبة ═══ */}
        {showLadder && (
          <ol className={styles.elrLadder} aria-label="مراحل الحلقة">
            {LADDER_STAGES.map((stage, index) => (
              <li
                key={stage}
                className={styles.elrLadderStage}
                data-state={index < ladderStage ? 'done' : index === ladderStage ? 'current' : 'next'}
                data-final={index === 3 || undefined}
              >
                <span className={styles.elrLadderDot} aria-hidden="true" />
                <span className={styles.elrLadderLabel}>{stage}</span>
              </li>
            ))}
          </ol>
        )}

        {role === 'player' && storageProbeReady && !storageAvailable && (
          <Card className={styles.elrAlert} role="status">
            <p>
              جلسة المتصفح لا تحتفظ بالتخزين المؤقت، ستنتهي هويتك فور إغلاق التبويب.
            </p>
          </Card>
        )}

        {role === 'player' && guestIdentityInvalid && phase === 'join' && (
          <Card className={styles.elrAlert} role="alert">
            <p>هوية الضيف السابقة انتهت. أنشئ هوية جديدة للمتابعة.</p>
            <Button type="button" variant="outline" size="sm" onClick={handleRecoverGuest}>
              تجديد الهوية الآن
            </Button>
          </Card>
        )}

        <AnimatePresence mode="wait">
          {/* ═══ الدخول ═══ */}
          {phase === 'join' && (
            <motion.div
              key="intro"
              className={styles.elrJoinGrid}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
            >
              <Card className={styles.elrIntro}>
                <span className={styles.elrKicker}>لعبة مباشرة · حتى 32 لاعبًا</span>
                <h2 className={styles.elrHeroTitle}>
                  يبدأ السرب معًا… <span>ويبقى واحد</span>
                </h2>
                <p className={styles.elrHeroText}>{meta.description}</p>
                <ul className={styles.elrRules}>
                  {RULES.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ul>
              </Card>

              <Card className={styles.elrEntryPanel}>
                <div className={styles.elrEntryHeader}>
                  <div>
                    <span className={styles.elrEntryEyebrow}>
                      {role === 'host' ? 'بوابة محمية' : 'دخول المتسابقين'}
                    </span>
                    <h3>
                      {role === 'host' ? 'إعداد حلقة الإقصاء' : 'انضم إلى حلقة'}
                    </h3>
                    {role === 'host' && (
                      <p className={styles.elrHostLabel}>أنت المضيف: {hostName ?? 'المضيف'}</p>
                    )}
                  </div>
                  <ButtonLink
                    href={role === 'host' ? '/games/elimination-live' : '/games/elimination-live/host'}
                    variant="outline"
                    size="sm"
                  >
                    {role === 'host' ? 'دخول المتسابقين' : 'دخول المضيف'}
                  </ButtonLink>
                </div>

                {role === 'player' && (
                  <Input
                    id="elr-player-name"
                    label="اسم اللاعب"
                    value={playerName}
                    onChange={(e) => {
                      setPlayerName(e.target.value);
                      setError('');
                    }}
                    placeholder="الاسم الظاهر"
                    maxLength={30}
                    autoComplete="nickname"
                    description="يجب أن يكون الاسم من حرفين على الأقل"
                  />
                )}

                {role === 'host' ? (
                  <div className={styles.elrFieldRow}>
                    <div>
                      <label htmlFor="elr-rounds" className={styles.elrFieldLabel}>
                        عدد الجولات
                      </label>
                      <select
                        id="elr-rounds"
                        className={styles.elrSelect}
                        value={totalRounds}
                        onChange={(e) => setTotalRounds(Number(e.target.value))}
                      >
                        {[3, 4, 5, 6, 7, 8].map((n) => (
                          <option key={n} value={n}>
                            {formatNumber(n)} جولات
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="elr-time" className={styles.elrFieldLabel}>
                        زمن الإجابة
                      </label>
                      <select
                        id="elr-time"
                        className={styles.elrSelect}
                        value={roundTimeLimit}
                        onChange={(e) => setRoundTimeLimit(Number(e.target.value))}
                      >
                        {ROUND_TIME_OPTIONS.map((seconds) => (
                          <option key={seconds} value={seconds}>
                            {formatNumber(seconds)} ثانية
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : null}

                {role === 'host' ? (
                  <Button
                    variant="gold"
                    size="lg"
                    loading={busy}
                    disabled={!room?.roomCode && (!connected || identityBlocked)}
                    onClick={handleHost}
                    fullWidth
                  >
                    <Swords aria-hidden="true" />
                    إنشاء الحلقة
                  </Button>
                ) : (
                  <>
                    <Input
                      id="elr-join-code"
                      label="رمز الحلقة"
                      placeholder="أدخل الرمز (مثلاً: ABC234)"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      dir="ltr"
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                    <Button
                      variant="gold"
                      size="lg"
                      loading={busy}
                      disabled={
                        !connected ||
                        busy ||
                        identityBlocked ||
                        playerName.trim().length < 2 ||
                        !joinCode.trim()
                      }
                      onClick={handleJoin}
                      fullWidth
                    >
                      <Play aria-hidden="true" />
                      انضمام للحلقة
                    </Button>
                  </>
                )}
              </Card>
            </motion.div>
          )}

          {/* ═══ العد التنازلي ═══ */}
          {phase === 'countdown' && countdown && (
            <motion.div
              key="countdown"
              className={styles.elrCountdownWrap}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
            >
              <p className={styles.elrCountdownLabel}>استعد… تُفتح الحلقة خلال</p>
              <div
                className={styles.elrCountdownNumber}
                aria-live="polite"
                aria-atomic="true"
              >
                {formatNumber(countdown.remaining)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══ الانتظار ═══ */}
        {phase === 'waiting' && room && (
          <Card className={styles.elrWaitingStage}>
            <div className={styles.elrWaitingHead}>
              <h2>الحلقة مفتوحة</h2>
              <p>شارك الرمز مع اللاعبين ثم أطلق الجولة الأولى.</p>
            </div>
            <div className={styles.elrRoomCodeBox}>
              <span className={styles.elrRoomCodeLabel}>رمز الدخول</span>
              <strong className={styles.elrRoomCodeValue} dir="ltr">
                {roomCode}
              </strong>
              <Button variant="outline" size="sm" onClick={copyInvite}>
                {copied ? (
                  <>
                    <Check aria-hidden="true" /> نُسخ
                  </>
                ) : (
                  <>
                    <Copy aria-hidden="true" /> نسخ رابط الدعوة
                  </>
                )}
              </Button>
            </div>
            <div className={styles.elrRosterMeta}>
              <span>
                <strong className="num">{formatNumber(room.players.length)}</strong> /
                {` ${formatNumber(32)}`} لاعبًا
              </span>
            </div>
            <ul className={styles.elrRosterGrid}>
              {room.players.length === 0 ? (
                <li className={styles.elrRosterEmpty}>بانتظار اللاعبين…</li>
              ) : (
                room.players.map((player) => (
                  <li key={player.id} data-viewer={player.isViewer || undefined}>
                    <span
                      className={styles.elrPlayerAvatar}
                      aria-hidden="true"
                    >
                      {player.name.slice(0, 1)}
                    </span>
                    {player.name}
                  </li>
                ))
              )}
            </ul>
            <div className={styles.elrWaitingActions}>
              {isHost && (
                <Button
                  variant="gold"
                  size="lg"
                  onClick={handleStart}
                  disabled={busy || !connected || room.players.length < 2}
                >
                  <Play aria-hidden="true" /> ابدأ الحلقة
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={handleLeave}>
                خروج
              </Button>
            </div>
          </Card>
        )}

        {/* ═══ اللعب ═══ */}
        {phase === 'play' && room && (
          <div className={styles.elrMainGrid}>
            <div className={styles.elrBoardColumn}>
              {currentQuestion && (
                <EliminationBoard
                  question={currentQuestion}
                  myAnswer={room.myAnswer}
                  revealedCorrectIndex={room.revealedCorrectIndex}
                  aliveCount={room.aliveCount}
                  roundLabel={roundLabel}
                  timeLabel={timeLabel}
                  disabled={busy}
                  timerRatio={timerRatio}
                  onSelectOption={handleSelectOption}
                />
              )}
              {isHost && (
                <div className={styles.elrHostActions}>
                  <Button variant="outline" size="sm" onClick={handleEndRound} disabled={busy}>
                    حسم الجولة الآن
                  </Button>
                </div>
              )}
            </div>

            {/* لوحة اللاعبين — جانبية على الشاشات الكبيرة */}
            <aside className={styles.elrPlayersPanel} aria-label="لوحة اللاعبين">
              <h3 className={styles.elrPanelTitle}>
                <Users size={16} aria-hidden="true" /> الناجون
                <strong className="num">{formatNumber(room.aliveCount)}</strong>
              </h3>
              <ul className={styles.elrPlayerList}>
                {alivePlayers.map((player) => (
                  <li
                    key={player.id}
                    className={styles.elrPlayerItem}
                    data-viewer={player.isViewer || undefined}
                  >
                    <span className={styles.elrPlayerAvatar} aria-hidden="true">
                      {player.name.slice(0, 1)}
                    </span>
                    <span className={styles.elrPlayerName}>{player.name}</span>
                    {player.hasAnswered ? (
                      <span className={`${styles.elrStatePill} ${styles.elrStateAnswered}`}>
                        <Check size={12} aria-hidden="true" /> أجاب
                      </span>
                    ) : (
                      <span className={`${styles.elrStatePill} ${styles.elrStateActive}`}>
                        نشط
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {eliminatedPlayers.length > 0 && (
                <>
                  <h3 className={`${styles.elrPanelTitle} ${styles.elrPanelTitleOut}`}>
                    خارج الحلقة
                    <strong className="num">{formatNumber(eliminatedPlayers.length)}</strong>
                  </h3>
                  <ul className={`${styles.elrPlayerList} ${styles.elrPlayerListOut}`}>
                    {rosterList(eliminatedPlayers)}
                  </ul>
                </>
              )}
            </aside>

            {/* زر لوحة اللاعبين على الهاتف */}
            <button
              type="button"
              className={`${styles.elrPlayersFab} ${styles.elrMobileOnly}`}
              onClick={() => setPlayersOpen(true)}
            >
              <Users size={18} aria-hidden="true" />
              اللاعبون
              <strong className="num">{formatNumber(room.aliveCount)}</strong>
            </button>

            <Dialog
              open={playersOpen}
              onOpenChange={setPlayersOpen}
              title="لوحة اللاعبين"
              description={`${formatNumber(room.aliveCount)} في الحلقة · ${formatNumber(eliminatedPlayers.length)} خارجها`}
              className="bottom-sheet"
            >
              <div className={styles.elrSheetBody}>
                <ul className={styles.elrPlayerList}>
                  {rosterList(room.players)}
                </ul>
              </div>
            </Dialog>
          </div>
        )}

        {/* ═══ حسم الجولة ═══ */}
        {phase === 'verdict' && room && (
          <motion.div
            key="verdict"
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className={styles.elrVerdictStage} role="status">
              {viewerEliminatedThisRound && (
                <div className={styles.elrBlewBanner} role="alert">
                  <X size={26} aria-hidden="true" />
                  <div>
                    <strong>{viewerTimedOut ? 'انتهى الوقت — تم إقصاؤك' : 'تم إقصاؤك'}</strong>
                    <span>أنت الآن من الجمهور… لا عودة إلى هذه الجولة</span>
                  </div>
                </div>
              )}

              <div className={styles.elrVerdictStats}>
                <div className={`${styles.elrStatChip} ${styles.elrStatSurvived}`}>
                  <strong className="num">{formatNumber(room.aliveCount)}</strong>
                  <span>ناجٍ</span>
                </div>
                <div className={`${styles.elrStatChip} ${styles.elrStatOut}`}>
                  <strong className="num">
                    {formatNumber(lastResult?.eliminatedIds.length ?? 0)}
                  </strong>
                  <span>أُقصي هذه الجولة</span>
                </div>
                <div className={`${styles.elrStatChip} ${styles.elrStatNext}`}>
                  <span>الصعوبة القادمة</span>
                  <strong>
                    {nextDifficulty
                      ? eliminationDifficultyLabel(nextDifficulty)
                      : eliminationDifficultyLabel(difficultyNow)}
                  </strong>
                </div>
              </div>

              {lastResult && (
                <div className={styles.elrVerdictBody}>
                  <p className={styles.elrVerdictQuestion}>{lastResult.prompt}</p>
                  <p className={styles.elrVerdictAnswer}>
                    الإجابة الصحيحة:{' '}
                    <strong>{lastResult.options[lastResult.correctIndex]}</strong>
                  </p>
                  <div className={styles.elrVerdictColumns}>
                    <div>
                      <h3 className={styles.elrPanelTitle}>يتقدمون</h3>
                      <ul className={styles.elrPlayerList}>
                        {room.players
                          .filter((player) => player.alive)
                          .map((player) => (
                            <li
                              key={player.id}
                              className={styles.elrPlayerItem}
                              data-viewer={player.isViewer || undefined}
                            >
                              <span className={styles.elrPlayerAvatar} aria-hidden="true">
                                {player.name.slice(0, 1)}
                              </span>
                              <span className={styles.elrPlayerName}>{player.name}</span>
                            </li>
                          ))}
                      </ul>
                    </div>
                    {(lastResult.eliminatedIds.length ?? 0) > 0 && (
                      <div>
                        <h3 className={`${styles.elrPanelTitle} ${styles.elrPanelTitleOut}`}>
                          أُقصيوا
                        </h3>
                        <ul className={`${styles.elrPlayerList} ${styles.elrPlayerListOut}`}>
                          {lastResult.eliminatedIds.map((id) => {
                            const player = room.players.find(
                              (candidate) => candidate.id === id,
                            );
                            return (
                              <li
                                key={id}
                                className={`${styles.elrPlayerItem} ${styles.elrPlayerOut}`}
                                data-viewer={player?.isViewer || undefined}
                              >
                                <span className={styles.elrPlayerAvatar} aria-hidden="true">
                                  {(player?.name ?? '؟').slice(0, 1)}
                                </span>
                                <span className={styles.elrPlayerName}>
                                  {player?.name ?? 'لاعب'}
                                </span>
                                <span className={`${styles.elrStatePill} ${styles.elrStateOut}`}>
                                  <X size={12} aria-hidden="true" />
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {isHost && (
                <div className={styles.elrHostActions}>
                  <Button
                    variant="gold"
                    onClick={handleNext}
                    disabled={busy || !connected}
                  >
                    <Play aria-hidden="true" /> الجولة التالية
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleFinishGame} disabled={busy}>
                    إنهاء الحلقة
                  </Button>
                </div>
              )}
            </Card>
          </motion.div>
        )}

        {/* ═══ التتويج ═══ */}
        {phase === 'finished' && room && (
          <motion.div
            key="finale"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <Card className={styles.elrFinale} role="status" aria-live="assertive">
              <div className={styles.elrFinaleGlow} aria-hidden="true" />
              <div className={styles.elrFinaleRays} aria-hidden="true" />

              <div className={styles.elrFinaleCrown} aria-hidden="true">
                <Crown size={34} strokeWidth={2} />
              </div>

              <p className={styles.elrFinaleEyebrow}>الناجي الأخير</p>
              <h2 className={styles.elrFinaleChampion}>
                {gameEnd?.championName ?? 'انتهت الحلقة'}
              </h2>

              <div className={styles.elrFinalePodium} aria-hidden="true">
                <span className={styles.elrPodiumStep} />
                <span className={styles.elrPodiumTop} />
              </div>

              {gameEnd?.championName && (
                <div className={styles.elrFinaleStats}>
                  <span className={styles.elrFinaleStat}>
                    <strong className="num">{formatNumber(gameEnd.totalRounds)}</strong>
                    <span>جولات نجا منها</span>
                  </span>
                  <span className={styles.elrFinaleStat}>
                    <strong className="num">
                      {formatNumber(
                        Math.round((gameEnd.durationMs || 0) / 1000 / 60),
                      )}
                    </strong>
                    <span>دقائق من المنافسة</span>
                  </span>
                  <span className={styles.elrFinaleStat}>
                    <strong className="num">
                      {formatNumber(room.players.length)}
                    </strong>
                    <span>بدأوا الحلقة</span>
                  </span>
                </div>
              )}

              {!viewerAlive && gameEnd?.championName && (
                <p className={styles.elrFinaleNote}>
                  أُقصيت في الجولة {formatNumber(viewerPlayer?.eliminatedAtRound ?? 0)} — حظًا أوفر في الحلقة القادمة.
                </p>
              )}

              <div className={styles.elrFinaleActions}>
                <Button
                  variant="gold"
                  size="lg"
                  onClick={handleLeave}
                >
                  <Swords aria-hidden="true" /> إعادة اللعب
                </Button>
                <ButtonLink href="/games" variant="outline" size="lg">
                  <Trophy aria-hidden="true" /> العودة إلى الألعاب
                </ButtonLink>
              </div>
            </Card>
          </motion.div>
        )}

        {error && (
          <div className={styles.elrError} role="alert">
            <p>{error}</p>
            {guestIdentityInvalid && (
              <div className={styles.elrErrorActions}>
                <Button type="button" variant="outline" size="sm" onClick={handleRecoverGuest}>
                  تجديد الهوية والمتابعة
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setError('')}>
                  تجاهل
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ نافذة القوانين ═══ */}
      <Dialog
        open={rulesOpen}
        onOpenChange={setRulesOpen}
        title="قوانين حلقة الإقصاء"
        description="سؤال واحد في كل جولة، والخطأ يعني الإقصاء"
      >
        <ul className={styles.elrRules}>
          {RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </Dialog>
      </section>
    </MotionScene>
  );
}

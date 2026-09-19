'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Check,
  Copy,
  Crown,
  LogOut,
  Play,
  Puzzle,
  Trophy,
} from 'lucide-react';
import type { ScrambledWordsPlayerView } from '@tahaddi/contracts';
import { Button, ButtonLink, Card, Input } from '@/components/ui';
import { MotionScene } from '@/components/motion/motion-scene';
import { getGameMotionScene } from '@/lib/motion';
import { INSTANT_GAME_META } from '@tahaddi/domain';
import { formatNumber } from '@/lib/utils';
import { useScrambledWordsSocket } from './use-scrambled-words-socket';
import { ScrambledWordsBoard } from './scrambled-words-board';
import { Avatar, FastestBadge, TimerRing } from './scrambled-words-ui';
import { sfx } from './use-sound-feedback';
import styles from './scrambled-words-room.module.css';
import {
  clearScrambledWordsGuestIdentity,
  getOrCreateScrambledWordsGuestId,
  getOrCreateScrambledWordsGuestToken,
  isScrambledWordsSessionStorageAvailable,
} from './scrambled-words-session-storage';

type Phase = 'join' | 'waiting' | 'countdown' | 'play' | 'between' | 'finished';
type GuestIdentity = { guestId: string; guestToken: string };
type HostIdentity = { hostId: string; accessToken: string };

const ROUND_TIME_OPTIONS = [15, 30, 60, 90, 120, 180, 300];
const TOTAL_ROUND_OPTIONS = [1, 3, 5, 8, 10, 15];

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${formatNumber(minutes)}:${String(seconds).padStart(2, '0')}`;
}

function loadInitialIdentity(): GuestIdentity {
  if (!isScrambledWordsSessionStorageAvailable()) {
    return { guestId: '', guestToken: '' };
  }
  return {
    guestId: getOrCreateScrambledWordsGuestId(),
    guestToken: getOrCreateScrambledWordsGuestToken(),
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

function LeaderboardRail({ players }: { players: ScrambledWordsPlayerView[] }) {
  return (
    <aside className={styles.swlRail} aria-label="ترتيب اللاعبين المباشر">
      <h3 className={styles.swlRailTitle}>
        <Trophy aria-hidden="true" size={16} />
        الترتيب المباشر
      </h3>
      <ol className={styles.swlRailList}>
        <AnimatePresence initial={false}>
          {players.map((player, index) => (
            <motion.li
              key={player.id}
              layout
              initial={false}
              className={styles.swlRailRow}
              data-viewer={player.isViewer || undefined}
              data-finished={player.finished || undefined}
            >
              <span
                className={styles.swlRankMedal}
                data-rank={index < 3 ? index + 1 : undefined}
              >
                {formatNumber(index + 1)}
              </span>
              <Avatar name={player.name} />
              <span className={styles.swlRailMeta}>
                <span className={styles.swlRailName}>{player.name}</span>
                <span className={styles.swlRailWords}>
                  {formatNumber(player.solvedCount)} / {formatNumber(player.wordCount)} كلمات
                </span>
              </span>
              <strong className={styles.swlRailScore}>
                {formatNumber(player.score)}
              </strong>
              {player.finished && <Check aria-hidden="true" size={16} className={styles.swlRailDone} />}
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </aside>
  );
}

export function ScrambledWordsRoom({
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
  const meta = INSTANT_GAME_META['scrambled-words-live'];
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
    wordRejectedTick,
  } = useScrambledWordsSocket(
    role === 'player' ? identity.guestId || undefined : undefined,
    role === 'player' ? identity.guestToken || undefined : undefined,
    role === 'host' ? hostIdentity : undefined,
  );

  const [playerName, setPlayerName] = useState('');
  const [totalRounds, setTotalRounds] = useState(5);
  const [roundTimeLimit, setRoundTimeLimit] = useState(60);
  const [firstFinish, setFirstFinish] = useState(false);
  const [copied, setCopied] = useState(false);
  const [submittedThisAttempt, setSubmittedThisAttempt] = useState(false);
  const [joinCode, setJoinCode] = useState(
    () => initialRoomCode?.toUpperCase() ?? '',
  );

  const roomCode = room?.roomCode ?? joinCode;
  const identityBlocked =
    role === 'host' ? !hostIdentity : guestIdentityInvalid || !guestIdentityKey;

  const phase: Phase = useMemo(() => {
    if (!room) return 'join';
    if (room.phase === 'active') return countdown ? 'countdown' : 'play';
    if (room.phase === 'waiting') {
      return room.currentRound > 0 ? 'between' : 'waiting';
    }
    if (room.phase === 'finished') return 'finished';
    return 'join';
  }, [room, countdown]);

  const isHost = room?.isHost ?? false;
  const remaining = useCountdown(room?.remainingSeconds ?? null);
  const currentPuzzle = room?.currentPuzzle ?? null;

  const solvedCount = room?.mySolvedWords.length ?? 0;
  const prevSolvedRef = useRef(solvedCount);
  useEffect(() => {
    if (solvedCount > prevSolvedRef.current) sfx.correct();
    prevSolvedRef.current = solvedCount;
  }, [solvedCount]);

  const prevRejectedRef = useRef(wordRejectedTick);
  useEffect(() => {
    if (wordRejectedTick > prevRejectedRef.current) sfx.wrong();
    prevRejectedRef.current = wordRejectedTick;
  }, [wordRejectedTick]);

  useEffect(() => {
    if (remaining != null && remaining > 0 && remaining <= 5) sfx.tick();
  }, [remaining]);

  const prevGameEndRef = useRef(false);
  useEffect(() => {
    if (gameEnd && !prevGameEndRef.current) sfx.win();
    prevGameEndRef.current = Boolean(gameEnd);
  }, [gameEnd]);

  const handleHost = () => {
    if (!socketRef.current) return;
    setBusy(true);
    setError('');
    socketRef.current.emit('scrambled:host', {
      totalRounds,
      roundTimeLimit,
      firstFinish,
    });
  };

  const handleJoin = () => {
    if (!socketRef.current || !roomCode) return;
    setBusy(true);
    setError('');
    socketRef.current.emit('scrambled:join', {
      roomCode: roomCode.toUpperCase(),
      playerName: playerName.trim(),
    });
  };

  const handleStart = () => {
    if (!socketRef.current || !roomCode) return;
    setBusy(true);
    setError('');
    socketRef.current.emit('scrambled:start', { roomCode: roomCode.toUpperCase() });
  };

  const handleNext = () => {
    if (!socketRef.current || !roomCode) return;
    setBusy(true);
    setError('');
    socketRef.current.emit('scrambled:next', { roomCode: roomCode.toUpperCase() });
  };

  const handleEndRound = () => {
    if (!socketRef.current || !roomCode) return;
    setBusy(true);
    setError('');
    socketRef.current.emit('scrambled:round:end', {
      roomCode: roomCode.toUpperCase(),
    });
  };

  const handleFinishGame = () => {
    if (!socketRef.current || !roomCode) return;
    setBusy(true);
    setError('');
    socketRef.current.emit('scrambled:game:finish', {
      roomCode: roomCode.toUpperCase(),
    });
  };

  const handleSubmitWord = (word: string) => {
    if (!socketRef.current || !room?.currentPuzzle || !roomCode) return;
    if (submittedThisAttempt || busy) return;
    setSubmittedThisAttempt(true);
    setBusy(true);
    socketRef.current.emit('scrambled:word:submit', {
      roomCode: roomCode.toUpperCase(),
      puzzleId: room.currentPuzzle.id,
      word,
      submissionId: `sw-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    });
    window.setTimeout(() => setSubmittedThisAttempt(false), 600);
  };

  const handleLeave = () => {
    if (!socketRef.current || !roomCode) return;
    socketRef.current.emit('scrambled:leave', { roomCode: roomCode.toUpperCase() });
    clearRoom();
  };

  const handleRecoverGuest = useCallback(() => {
    clearScrambledWordsGuestIdentity();
    cachedStoredIdentity = null;
    setIdentity(loadInitialIdentity());
  }, []);

  const shareUrl = useMemo(() => {
    if (!room || typeof window === 'undefined') return '';
    return `${window.location.origin}/games/scrambled-words-live/join/${room.roomCode}`;
  }, [room]);

  const copyInvite = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  };

  const timeLabel = remaining == null ? '--:--' : formatClock(remaining);
  const timeFraction =
    room && remaining != null && room.roundTimeLimit > 0
      ? remaining / room.roundTimeLimit
      : null;
  const roundLabel = room
    ? `الجولة ${formatNumber(room.currentRound)} من ${formatNumber(room.totalRounds)}`
    : '';
  const sortedPlayers = useMemo(() => {
    if (!room) return [];
    return [...room.players].sort(
      (a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ar'),
    );
  }, [room]);

  const finaleResults =
    gameEnd && gameEnd.results.length > 0
      ? gameEnd.results
      : sortedPlayers.map((player) => ({
          id: player.id,
          name: player.name,
          totalScore: player.score,
        }));
  const winner = finaleResults[0] ?? null;

  return (
    <MotionScene scene={getGameMotionScene(phase)} sceneKey={phase}>
      <section className={styles.swlRoom} dir="rtl">
        <div className={styles.swlShell}>
        <ButtonLink href="/games" variant="ghost" className={styles.swlBack}>
          كل الألعاب
        </ButtonLink>

        {role === 'player' && storageProbeReady && !storageAvailable && (
          <Card className={styles.swlAlert} role="status">
            <p>
              جلسة المتصفح لا تحتفظ بالتخزين المؤقت، ستنتهي هويتك فور إغلاق التبويب.
            </p>
          </Card>
        )}

        {role === 'player' && guestIdentityInvalid && phase === 'join' && (
          <Card className={styles.swlAlert} role="alert">
            <p>هوية الضيف السابقة انتهت. أنشئ هوية جديدة للمتابعة.</p>
            <Button type="button" variant="outline" size="sm" onClick={handleRecoverGuest}>
              تجديد الهوية الآن
            </Button>
          </Card>
        )}

        <AnimatePresence mode="wait">
          {phase === 'join' && (
            <motion.div
              key="intro"
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
            >
              <Card className={styles.swlIntro}>
                <span className={styles.swlKicker}>
                  <Puzzle aria-hidden="true" size={18} /> لعبة مباشرة
                </span>
                <h1>{meta.title}</h1>
                <p>{meta.description}</p>
                <ul className={styles.swlRules}>
                  <li>تظهر صورة على الشاشة وتُقطع كلماتها إلى مقاطع مبعثرة.</li>
                  <li>اضغط المقاطع بالترتيب الصحيح لتكوين كل كلمة تصف الصورة.</li>
                  <li>كل كلمة صحيحة = نقطة، والسباق مفتوح للجميع في الوقت نفسه.</li>
                  <li>ينتهي الوقت أو — بخيار «الأسرع» — أول من يكمل كل الكلمات.</li>
                </ul>
              </Card>

              <Card className={styles.swlEntryPanel}>
                <div className={styles.swlEntryHeader}>
                  <div>
                    <span className={styles.swlEntryEyebrow}>
                      {role === 'host' ? 'بوابة محمية' : 'دخول المتسابقين'}
                    </span>
                    <h2>
                      {role === 'host' ? 'إعداد غرفة كلمات مفككة' : 'انضم إلى غرفة'}
                    </h2>
                    {role === 'host' && (
                      <p className={styles.swlHostLabel}>أنت المضيف: {hostName ?? 'المضيف'}</p>
                    )}
                  </div>
                  <ButtonLink
                    href={role === 'host' ? '/games/scrambled-words-live' : '/games/scrambled-words-live/host'}
                    variant="outline"
                    size="sm"
                  >
                    {role === 'host' ? 'دخول المتسابقين' : 'دخول المضيف'}
                  </ButtonLink>
                </div>

                {role === 'player' && (
                  <Input
                    id="swl-player-name"
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
                  <div className={styles.swlFieldRow}>
                    <div>
                      <label htmlFor="swl-rounds" className={styles.swlFieldLabel}>
                        عدد الجولات
                      </label>
                      <select
                        id="swl-rounds"
                        className={styles.swlSelect}
                        value={totalRounds}
                        onChange={(e) => setTotalRounds(Number(e.target.value))}
                      >
                        {TOTAL_ROUND_OPTIONS.map((n) => (
                          <option key={n} value={n}>
                            {formatNumber(n)} جولات
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="swl-time" className={styles.swlFieldLabel}>
                        وقت الجولة
                      </label>
                      <select
                        id="swl-time"
                        className={styles.swlSelect}
                        value={roundTimeLimit}
                        onChange={(e) => setRoundTimeLimit(Number(e.target.value))}
                      >
                        {ROUND_TIME_OPTIONS.map((seconds) => (
                          <option key={seconds} value={seconds}>
                            {seconds >= 60
                              ? `${formatNumber(seconds / 60)} دقيقة`
                              : `${formatNumber(seconds)} ثانية`}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <span className={styles.swlFieldLabel}>وضع الأسرع</span>
                      <button
                        type="button"
                        className={`${styles.swlToggle} ${firstFinish ? 'is-on' : ''}`}
                        role="switch"
                        aria-checked={firstFinish}
                        onClick={() => setFirstFinish((value) => !value)}
                      >
                        {firstFinish ? 'نعم' : 'لا'}
                      </button>
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
                    <Puzzle aria-hidden="true" />
                    إنشاء الغرفة
                  </Button>
                ) : (
                  <>
                    <Input
                      id="swl-join-code"
                      label="رمز الغرفة"
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
                      انضمام للغرفة
                    </Button>
                  </>
                )}
              </Card>
            </motion.div>
          )}

          {phase === 'countdown' && countdown && (
            <motion.div
              key="countdown"
              initial={reduceMotion ? false : { opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
            >
              <Card className={styles.swlCountdownWrap}>
                <h2 className={styles.swlCountdownLabel}>تبدأ الجولة خلال…</h2>
                <div
                  className={styles.swlCountdownNumber}
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {formatNumber(countdown.remaining)}
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {phase === 'waiting' && room && (
          <Card className={styles.swlWaitingStage}>
            <div className={styles.swlWaitingHead}>
              <h2>غرفة اللعب</h2>
              <p>شارك الرمز مع اللاعبين ثم ابدأ الجولة.</p>
            </div>
            <p className={styles.swlRoomCode}>
              رمز الدخول
              <strong dir="ltr">{roomCode}</strong>
            </p>
            <ul className={styles.swlRoster}>
              {room.players.length === 0 ? (
                <li>بانتظار اللاعبين…</li>
              ) : (
                room.players.map((player) => (
                  <li key={player.id} data-viewer={player.isViewer || undefined}>
                    <Avatar name={player.name} />
                    {player.name}
                  </li>
                ))
              )}
            </ul>
            <div className={styles.swlWaitingActions}>
              {isHost && (
                <Button
                  variant="gold"
                  size="lg"
                  onClick={handleStart}
                  disabled={busy || !connected || room.players.length === 0}
                >
                  <Play aria-hidden="true" /> بدء اللعبة
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={copyInvite}>
                {copied ? (
                  <>
                    <Check aria-hidden="true" /> نُسخ الرابط
                  </>
                ) : (
                  <>
                    <Copy aria-hidden="true" /> نسخ رابط الدعوة
                  </>
                )}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleLeave}>
                خروج
              </Button>
            </div>
          </Card>
        )}

        {phase === 'play' && room && (
          <div className={styles.swlPlayArea}>
            {room.firstFinish && <FastestBadge />}
            <div className={styles.swlPlayGrid}>
              {isHost ? (
                <Card className={styles.swlHostStage}>
                  <header className={styles.swlBoardHeader}>
                    <div className={styles.swlBoardTitle}>
                      <span className={styles.swlWordmark}>تحدّي</span>
                      <span className={styles.swlGameName}>كلمات مفككة</span>
                      <span className={styles.swlBadge}>{roundLabel}</span>
                    </div>
                    <div className={styles.swlHeaderTools}>
                      <TimerRing fraction={timeFraction} label={timeLabel} />
                    </div>
                  </header>
                  {currentPuzzle ? (
                    <figure className={styles.swlHero}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={currentPuzzle.imageUrl}
                        alt={`صورة الجولة ${formatNumber(currentPuzzle.roundNumber)}`}
                        className={styles.swlHeroImage}
                        draggable={false}
                      />
                      <figcaption className={styles.swlHeroCaption}>
                        شاشة المضيف — راقب تقدم اللاعبين
                      </figcaption>
                    </figure>
                  ) : (
                    <p className={styles.swlHint}>لا توجد صورة معروضة.</p>
                  )}
                  <ul className={styles.swlProgress} aria-label="تقدم اللاعبين">
                    {sortedPlayers.map((player) => (
                      <li key={player.id} data-finished={player.finished || undefined}>
                        <Avatar name={player.name} />
                        <span>{player.name}</span>
                        <strong>
                          {formatNumber(player.solvedCount)} / {formatNumber(player.wordCount)}
                        </strong>
                      </li>
                    ))}
                  </ul>
                  <div className={styles.swlHostActions}>
                    <Button variant="outline" size="sm" onClick={handleEndRound} disabled={busy}>
                      إنهاء الجولة
                    </Button>
                  </div>
                </Card>
              ) : (
                currentPuzzle && (
                  <ScrambledWordsBoard
                    puzzle={{
                      id: currentPuzzle.id,
                      imageUrl: currentPuzzle.imageUrl,
                      fragments: currentPuzzle.fragments,
                      wordLengths: currentPuzzle.wordLengths,
                      roundNumber: currentPuzzle.roundNumber,
                    }}
                    solvedWords={room.mySolvedWords}
                    disabled={busy}
                    rejectedTick={wordRejectedTick}
                    roundLabel={roundLabel}
                    timeLabel={timeLabel}
                    timeFraction={timeFraction}
                    onSubmitWord={handleSubmitWord}
                  />
                )
              )}

              <LeaderboardRail players={sortedPlayers} />
            </div>
          </div>
        )}

        {phase === 'between' && room && (
          <Card className={styles.swlBetweenStage} role="status">
            <h2 className={styles.swlBetweenTitle}>
              انتهت الجولة {formatNumber(room.currentRound)}
            </h2>
            {room.lastRoundWords.length > 0 && (
              <div className={styles.swlBetweenWords}>
                {room.lastRoundWords.map((word) => (
                  <span key={word} className={styles.swlSolvedChip}>
                    {word}
                  </span>
                ))}
              </div>
            )}
            {(() => {
              const results =
                room.lastRoundResults.length > 0
                  ? room.lastRoundResults
                  : sortedPlayers.map((player) => ({
                      id: player.id,
                      name: player.name,
                      roundScore: player.roundScore,
                      totalScore: player.score,
                    }));
              const podium = results.slice(0, 3);
              if (podium.length === 0) return null;
              const columns = [podium[1], podium[0], podium[2]].filter(Boolean);
              return (
                <div className={styles.swlPodium}>
                  {columns.map((entry) => {
                    const place = podium.indexOf(entry) + 1;
                    return (
                      <div
                        key={entry.id}
                        className={styles.swlPodiumStep}
                        data-place={place}
                        data-viewer={entry.id === room.viewerPlayerId || undefined}
                      >
                        {place === 1 && (
                          <Crown aria-hidden="true" size={20} className={styles.swlPodiumCrown} />
                        )}
                        <Avatar name={entry.name} />
                        <span className={styles.swlPodiumName}>{entry.name}</span>
                        <b className={styles.swlPodiumScore}>+{formatNumber(entry.roundScore)}</b>
                        <span className={styles.swlPodiumPlace} data-place={place}>
                          {formatNumber(place)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            <ol className={styles.swlScoreList}>
              {(room.lastRoundResults.length > 0
                ? room.lastRoundResults
                : sortedPlayers.map((player) => ({
                    id: player.id,
                    name: player.name,
                    roundScore: player.roundScore,
                    totalScore: player.score,
                  }))
              ).map((result, index) => (
                <li
                  key={result.id}
                  data-viewer={result.id === room.viewerPlayerId || undefined}
                >
                  <span className={styles.swlRankMedal} data-rank={index < 3 ? index + 1 : undefined}>
                    {formatNumber(index + 1)}
                  </span>
                  <span className={styles.swlPlayerName}>{result.name}</span>
                  <span className={styles.swlBetweenRound}>
                    +{formatNumber(result.roundScore)}
                  </span>
                  <strong>{formatNumber(result.totalScore)}</strong>
                </li>
              ))}
            </ol>
            <p className={styles.swlRoundNote}>
              الجولة {formatNumber(room.currentRound)} من {formatNumber(room.totalRounds)}
            </p>
            {isHost && (
              <div className={styles.swlHostActions}>
                <Button
                  variant="gold"
                  onClick={handleNext}
                  disabled={busy || !connected}
                >
                  <Play aria-hidden="true" /> الجولة التالية
                </Button>
                <Button variant="outline" size="sm" onClick={handleFinishGame} disabled={busy}>
                  إنهاء اللعبة
                </Button>
              </div>
            )}
          </Card>
        )}

        {phase === 'finished' && room && (
          <Card className={styles.swlFinale} role="status" aria-live="assertive">
            {winner && (
              <div className={styles.swlWinner} data-viewer={winner.id === room.viewerPlayerId || undefined}>
                <Trophy aria-hidden="true" className={styles.swlFinaleTrophy} />
                <span className={styles.swlWinnerLabel}>الفائز</span>
                <Avatar name={winner.name} />
                <strong className={styles.swlWinnerName}>{winner.name}</strong>
                <span className={styles.swlWinnerScore}>
                  {formatNumber(winner.totalScore)} نقطة
                </span>
                {gameEnd && (
                  <span className={styles.swlWinnerTime} dir="ltr">
                    {formatClock(Math.round(gameEnd.durationMs / 1000))}
                  </span>
                )}
              </div>
            )}
            <h2 className={styles.swlFinaleTitle}>نتائج اللعبة</h2>
            <ol className={styles.swlFinaleList}>
              {finaleResults.map((result, index) => (
                <li
                  key={result.id}
                  data-viewer={result.id === room.viewerPlayerId || undefined}
                >
                  <span className={styles.swlRankMedal} data-rank={index < 3 ? index + 1 : undefined}>
                    {formatNumber(index + 1)}
                  </span>
                  <strong>{result.name}</strong>
                  <span>{formatNumber(result.totalScore)} نقطة</span>
                </li>
              ))}
            </ol>
            <div className={styles.swlFinaleActions}>
              <Button type="button" onClick={handleLeave}>
                <LogOut aria-hidden="true" size={16} />
                العودة للألعاب
              </Button>
            </div>
          </Card>
        )}

        {error && (
          <div className={styles.swlError} role="alert">
            <p>{error}</p>
            {guestIdentityInvalid && (
              <div className={styles.swlErrorActions}>
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
      </section>
    </MotionScene>
  );
}

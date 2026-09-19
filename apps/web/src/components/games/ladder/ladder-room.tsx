'use client';

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Play, Swords, Trophy, CircleDot, Circle, Copy, Check, UserPlus } from 'lucide-react';
import { Button, ButtonLink, Card, Input } from '@/components/ui';
import { MotionScene } from '@/components/motion/motion-scene';
import { getGameMotionScene } from '@/lib/motion';
import { INSTANT_GAME_META } from '@tahaddi/domain';
import { formatNumber } from '@/lib/utils';
import { useLadderSocket } from './use-ladder-socket';
import styles from './ladder-room.module.css';
import { LadderVisual } from './ladder-visual';
import { QuestionDisplay } from './question-display';
import { TeamPanel } from './team-panel';
import {
  clearLadderGuestIdentity,
  getOrCreateLadderGuestId,
  getOrCreateLadderGuestToken,
  isLadderSessionStorageAvailable,
} from './ladder-session-storage';

type Phase = 'join' | 'waiting' | 'countdown' | 'question' | 'finished';
type GuestIdentity = { guestId: string; guestToken: string };
type HostIdentity = { hostId: string; accessToken: string };

function loadInitialIdentity(): GuestIdentity {
  if (!isLadderSessionStorageAvailable()) {
    return { guestId: '', guestToken: '' };
  }
  return {
    guestId: getOrCreateLadderGuestId(),
    guestToken: getOrCreateLadderGuestToken(),
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

export function LadderRoom({
  initialRoomCode,
  role = 'player',
  hostIdentity,
  hostName,
  quizId = null,
  packTitle = null,
}: {
  initialRoomCode?: string;
  role?: 'player' | 'host';
  hostIdentity?: HostIdentity;
  hostName?: string;
  quizId?: string | null;
  packTitle?: string | null;
}) {
  const meta = INSTANT_GAME_META.ladder;
  const reduceMotion = useReducedMotion();
  const storageProbeReady = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

  // Persisted in session storage. State-based so a successful recovery
  // (clear + regenerate) can re-trigger the socket useEffect with a
  // fresh pair.
  const storedIdentity = useSyncExternalStore(subscribeNoop, readStoredIdentity, emptyIdentity);
  const [recoveredIdentity, setIdentity] = useState<GuestIdentity | null>(null);
  const identity = recoveredIdentity ?? storedIdentity;
  const storageAvailable = identity.guestId.length > 0 && identity.guestToken.length > 0;
  const guestIdentityKey = storageAvailable ? `${identity.guestId}::${identity.guestToken}` : '';

  const {
    connected,
    room,
    error,
    busy,
    gameEnd,
    countdown,
    guestIdentityInvalid,
    setError,
    setBusy,
    socketRef,
    clearRoom,
  } = useLadderSocket(
    role === 'player' ? identity.guestId || undefined : undefined,
    role === 'player' ? identity.guestToken || undefined : undefined,
    role === 'host' ? hostIdentity : undefined,
  );

  // Entry mode follows the URL hint by default, but the user can switch
  // freely via the tab list. Using a controlled tab state fixes the
  // previous `onClick={() => {}}` bug where the tab buttons had no
  // effect.
  const entryMode = role === 'host' ? 'create' : 'join';
  const [playerName, setPlayerName] = useState('');
  const [team, setTeam] = useState<'right' | 'left'>('right');
  const [totalRounds, setTotalRounds] = useState(10);
  const [winningPosition, setWinningPosition] = useState(10);
  const [questionTimeLimit, setQuestionTimeLimit] = useState(30);
  const [copied, setCopied] = useState(false);
  const [answerSelection, setAnswerSelection] = useState<{
    questionId: string;
    optionId: string;
  } | null>(null);
  const [joinCode, setJoinCode] = useState(() => initialRoomCode?.toUpperCase() ?? '');

  const roomCode = room?.roomCode ?? joinCode;
  const identityBlocked =
    role === 'host' ? !hostIdentity : guestIdentityInvalid || !guestIdentityKey;

  // Derive the local UI phase from the server-authoritative room state.
  // The two purely-local phases ('join' and 'countdown') live in
  // localPhase so we never have to mirror room state inside an effect.
  const [localPhase, setLocalPhase] = useState<'join' | 'countdown'>('join');
  const phase: Phase = useMemo(() => {
    if (localPhase === 'countdown') return 'countdown';
    if (!room) return 'join';
    if (room.phase === 'waiting') return 'waiting';
    if (room.phase === 'active') return 'question';
    if (room.phase === 'finished') return 'finished';
    return 'join';
  }, [room, localPhase]);

  const setPhase = setLocalPhase;

  const isHost = room?.isHost ?? false;

  const handleHost = () => {
    if (!socketRef.current) return;
    setBusy(true);
    setError('');
    socketRef.current.emit('ladder:host', {
      totalRounds,
      winningPosition,
      questionTimeLimit,
      ...(quizId ? { quizId } : {}),
    });
  };

  const handleJoin = () => {
    if (!socketRef.current || !roomCode) return;
    setBusy(true);
    setError('');
    socketRef.current.emit('ladder:join', {
      roomCode: roomCode.toUpperCase(),
      playerName: playerName.trim(),
      team,
    });
  };

  const handleStart = () => {
    if (!socketRef.current || !roomCode) return;
    setBusy(true);
    setError('');
    socketRef.current.emit('ladder:start', { roomCode: roomCode.toUpperCase() });
  };

  const handleAnswer = (optionId: string) => {
    if (!socketRef.current || !room?.currentQuestion || !roomCode) return;
    setAnswerSelection({ questionId: room.currentQuestion.id, optionId });
    setBusy(true);
    socketRef.current.emit('ladder:answer', {
      roomCode: roomCode.toUpperCase(),
      questionId: room.currentQuestion.id,
      optionId,
    });
  };

  const handleLeave = () => {
    if (!socketRef.current || !roomCode) return;
    socketRef.current.emit('ladder:leave', { roomCode: roomCode.toUpperCase() });
    clearRoom();
    setPhase('join');
  };

  const handleRecoverGuest = useCallback(() => {
    // Wipe the persisted id/token and ask the parent to remount the
    // socket with a freshly generated pair on the next render.
    clearLadderGuestIdentity();
    cachedStoredIdentity = null;
    setIdentity(loadInitialIdentity());
  }, []);

  const shareUrl = useMemo(() => {
    if (!room || typeof window === 'undefined') return '';
    return `${window.location.origin}/games/ladder/join/${room.roomCode}`;
  }, [room]);

  const copyInvite = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  };

  const currentQuestion = room?.currentQuestion;
  const selectedOption =
    currentQuestion && answerSelection?.questionId === currentQuestion.id
      ? answerSelection.optionId
      : null;
  const createPanelId = 'ladder-panel-create';
  const joinPanelId = 'ladder-panel-join';
  const teamPress = reduceMotion ? undefined : { scale: 0.98 };
  const teamHover = reduceMotion ? undefined : { y: -2 };

  return (
    <MotionScene scene={getGameMotionScene(phase)} sceneKey={phase}>
      <section className={styles.ladderRoom} dir="rtl">
        <div className={styles.ladderShell}>
        <ButtonLink href="/games" variant="ghost" className={styles.ladderBack}>
          كل الألعاب
        </ButtonLink>

        {role === 'player' && storageProbeReady && !storageAvailable && (
          <Card className={`${styles.ladderError} ${styles.identityAlert}`} role="status">
            <p>
              جلسة المتصفح لا تحتفظ بالتخزين المؤقت. سيلعب السلم في هذه الجلسة كزائر مجهول، وستنتهي
              صلاحية الغرفة فور إغلاق التبويب.
            </p>
          </Card>
        )}

        {role === 'player' && guestIdentityInvalid && phase === 'join' && (
          <Card className={`${styles.ladderError} ${styles.identityAlert}`} role="alert">
            <p>هوية الضيف السابقة انتهت. أنشئ هوية جديدة للمتابعة دون فقدان التقدم.</p>
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
              <Card className={styles.ladderIntro}>
                <span className={styles.ladderKicker}>
                  <Swords aria-hidden="true" size={18} /> لعبة تنافسية
                </span>
                <h1>{meta.title}</h1>
                <p>{meta.description}</p>
                <ul className={styles.ladderRules}>
                  <li>فريقان: يمين (ذهبي) ويسار (سماوي).</li>
                  <li>
                    {quizId
                      ? `الأسئلة تُسحب من الحزمة المحفوظة${packTitle ? ` «${packTitle}»` : ''}، مع الرجوع لبنك السلم عند الحاجة.`
                      : 'الأسئلة تُسحب تلقائيًا من بنك الأسئلة الموسوم بـ«لعبة السلم»، بلا تكرار داخل الغرفة.'}
                  </li>
                  <li>إجابة صحيحة = صعود درجة، إجابة خاطئة = هبوط درجة.</li>
                  <li>أول فريق يبلغ القمة ({formatNumber(winningPosition)} درجات) يفوز.</li>
                </ul>
              </Card>

              <Card className={styles.ladderEntryPanel}>
                <div className={styles.entryPortalHeader}>
                  <div>
                    <span className={styles.entryPortalEyebrow}>
                      {role === 'host' ? 'بوابة محمية' : 'دخول المتسابقين'}
                    </span>
                    <h2
                      id={role === 'host' ? 'ladder-host-entry-title' : 'ladder-player-entry-title'}
                    >
                      {role === 'host' ? 'إعداد غرفة السلم' : 'انضم إلى غرفة'}
                    </h2>
                    {role === 'host' && (
                      <p className={styles.hostIdentityLabel}>أنت المضيف: {hostName ?? 'المضيف'}</p>
                    )}
                  </div>
                  <ButtonLink
                    href={role === 'host' ? '/games/ladder' : '/games/ladder/host'}
                    variant="outline"
                    size="sm"
                  >
                    {role === 'host' ? 'دخول المتسابقين' : 'دخول المضيف'}
                  </ButtonLink>
                </div>

                {role === 'player' && (
                  <Input
                    id="ladder-player-name"
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

                {role === 'player' && (
                  <div className={styles.entryTeamBlock}>
                    <span id="ladder-team-label" className={styles.entryFieldLabel}>
                      اختر الفريق
                    </span>
                    <div
                      className={styles.entryTeamChoice}
                      role="radiogroup"
                      aria-labelledby="ladder-team-label"
                    >
                      <motion.button
                        whileHover={teamHover}
                        whileTap={teamPress}
                        type="button"
                        role="radio"
                        aria-checked={team === 'right'}
                        className={styles.entryTeamOption}
                        data-team="right"
                        onClick={() => setTeam('right')}
                      >
                        <span className={styles.entryTeamIconWrap}>
                          <CircleDot
                            aria-hidden="true"
                            className={styles.entryTeamIcon}
                            data-team="right"
                            size={24}
                          />
                        </span>
                        <span className={styles.entryTeamLabel}>فريق اليمين</span>
                      </motion.button>
                      <motion.button
                        whileHover={teamHover}
                        whileTap={teamPress}
                        type="button"
                        role="radio"
                        aria-checked={team === 'left'}
                        className={styles.entryTeamOption}
                        data-team="left"
                        onClick={() => setTeam('left')}
                      >
                        <span className={styles.entryTeamIconWrap}>
                          <Circle
                            aria-hidden="true"
                            className={styles.entryTeamIcon}
                            data-team="left"
                            size={24}
                          />
                        </span>
                        <span className={styles.entryTeamLabel}>فريق اليسار</span>
                      </motion.button>
                    </div>
                  </div>
                )}

                {entryMode === 'create' ? (
                  <motion.div
                    initial={reduceMotion ? false : { opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    role="tabpanel"
                    id={createPanelId}
                    aria-labelledby="ladder-host-entry-title"
                    className={styles.tabpanel}
                  >
                    <div className={styles.entryFieldRow}>
                      <div>
                        <label htmlFor="ladder-rounds" className={styles.entryFieldLabel}>
                          عدد الجولات
                        </label>
                        <select
                          id="ladder-rounds"
                          className={styles.entrySelect}
                          value={totalRounds}
                          onChange={(e) => setTotalRounds(Number(e.target.value))}
                        >
                          {[5, 10, 15, 20].map((n) => (
                            <option key={n} value={n}>
                              {formatNumber(n)} جولات
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="ladder-winning" className={styles.entryFieldLabel}>
                          درجة الفوز
                        </label>
                        <select
                          id="ladder-winning"
                          className={styles.entrySelect}
                          value={winningPosition}
                          onChange={(e) => setWinningPosition(Number(e.target.value))}
                        >
                          {[5, 10, 15, 20].map((n) => (
                            <option key={n} value={n}>
                              {formatNumber(n)} درجات
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="ladder-question-time" className={styles.entryFieldLabel}>
                          الحد الأدنى لوقت السؤال
                        </label>
                        <select
                          id="ladder-question-time"
                          className={styles.entrySelect}
                          value={questionTimeLimit}
                          onChange={(e) => setQuestionTimeLimit(Number(e.target.value))}
                        >
                          {[20, 30, 45, 60].map((seconds) => (
                            <option key={seconds} value={seconds}>
                              {formatNumber(seconds)} ثانية
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <Button
                      variant="gold"
                      size="lg"
                      loading={busy}
                      disabled={!connected || busy || identityBlocked}
                      onClick={handleHost}
                      fullWidth
                    >
                      <Swords aria-hidden="true" />
                      إنشاء الغرفة
                    </Button>
                  </motion.div>
                ) : (
                  <motion.div
                    initial={reduceMotion ? false : { opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    role="tabpanel"
                    id={joinPanelId}
                    aria-labelledby="ladder-player-entry-title"
                    className={styles.tabpanel}
                  >
                    <Input
                      id="ladder-join-code"
                      label="رمز الغرفة"
                      placeholder="أدخل الرمز (مثلاً: ABCD12)"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      dir="ltr"
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck={false}
                      inputMode="text"
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
                      <UserPlus aria-hidden="true" />
                      {initialRoomCode ? 'انضمام للغرفة' : 'انضمام برمز'}
                    </Button>
                    <p className={styles.tabpanelHint}>
                      {!initialRoomCode ? 'أدخل رمز الغرفة للانضمام.' : 'ستنضم للغرفة فور الاتصال.'}
                    </p>
                  </motion.div>
                )}
              </Card>
            </motion.div>
          )}

          {phase === 'waiting' && room && (
            <motion.div
              key="waiting"
              initial={reduceMotion ? false : { opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
              className={styles.waitingStack}
            >
              <Card className={styles.waitingStage}>
                <div className={styles.ladderWaitingMatchup}>
                  <div className={styles.ladderWaitingPlayer} data-team="right">
                    <strong>فريق اليمين</strong>
                    <span>{formatNumber(room.rightTeam?.length ?? 0)} لاعب</span>
                    <ul className={styles.waitingRoster}>
                      {(room.rightTeam ?? []).length > 0 ? (
                        (room.rightTeam ?? []).map((player, index) => (
                          <li key={`${player.playerName}-${index}`}>
                            {player.playerName}
                            {player.isHost ? ' · مضيف' : ''}
                          </li>
                        ))
                      ) : (
                        <li>بانتظار اللاعبين</li>
                      )}
                    </ul>
                  </div>
                  <div className={styles.ladderWaitingVs} aria-hidden="true">
                    VS
                  </div>
                  <div className={styles.ladderWaitingPlayer} data-team="left">
                    <strong>فريق اليسار</strong>
                    <span>{formatNumber(room.leftTeam?.length ?? 0)} لاعب</span>
                    <ul className={styles.waitingRoster}>
                      {(room.leftTeam ?? []).length > 0 ? (
                        (room.leftTeam ?? []).map((player, index) => (
                          <li key={`${player.playerName}-${index}`}>
                            {player.playerName}
                            {player.isHost ? ' · مضيف' : ''}
                          </li>
                        ))
                      ) : (
                        <li>بانتظار اللاعبين</li>
                      )}
                    </ul>
                  </div>
                </div>

                <p className={styles.waitingRoomCode}>
                  رمز الدخول
                  <strong dir="ltr">{roomCode}</strong>
                </p>

                <div className={styles.waitingActions}>
                  {isHost && (
                    <Button
                      variant="gold"
                      size="lg"
                      onClick={handleStart}
                      disabled={busy || !connected}
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
            </motion.div>
          )}

          {phase === 'countdown' && countdown && (
            <motion.div
              key="countdown"
              initial={reduceMotion ? false : { opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
            >
              <Card className={styles.countdownWrap}>
                <h2 className={styles.countdownLabel}>تبدأ اللعبة خلال...</h2>
                <div className={styles.countdownNumber} aria-live="polite" aria-atomic="true">
                  {formatNumber(countdown.remaining)}
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {(phase === 'question' || phase === 'finished') && room && (
          <div className={styles.ladderBoard}>
            <TeamPanel
              team="right"
              players={room.rightTeam ?? []}
              score={room.rightScore}
              position={room.rightPosition}
              winningPosition={room.winningPosition}
              isHost={isHost}
            />
            <div className={styles.ladderCenter}>
              <div className={styles.ladderBoardScores} role="group" aria-label="النتيجة">
                <div
                  className={styles.scoreMain}
                  data-team="right"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {formatNumber(room.rightScore)}
                </div>
                <div className={styles.scoreVersus} aria-hidden="true">
                  VS
                </div>
                <div
                  className={styles.scoreMain}
                  data-team="left"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {formatNumber(room.leftScore)}
                </div>
              </div>
            </div>
            <TeamPanel
              team="left"
              players={room.leftTeam ?? []}
              score={room.leftScore}
              position={room.leftPosition}
              winningPosition={room.winningPosition}
              isHost={isHost}
            />
          </div>
        )}

        {(phase === 'question' || phase === 'finished') && room && (
          <LadderVisual
            rightPosition={room.rightPosition}
            leftPosition={room.leftPosition}
            winningPosition={room.winningPosition}
            currentRound={room.currentRound}
            totalRounds={room.totalRounds}
          >
            {phase === 'question' && currentQuestion ? (
              <QuestionDisplay
                question={currentQuestion}
                timeLimit={currentQuestion.timeLimit}
                roundNumber={currentQuestion.roundNumber}
                totalRounds={room.totalRounds}
                onAnswer={handleAnswer}
                selectedOption={selectedOption}
                disabled={busy || isHost}
              />
            ) : null}
          </LadderVisual>
        )}

        {phase === 'finished' && gameEnd && (
          <Card className={styles.ladderFinale} role="status" aria-live="assertive">
            <Trophy aria-hidden="true" className={styles.finaleTrophy} />
            <h2 className={styles.finaleTitle}>
              {gameEnd.winner === 'draw'
                ? 'تعادل'
                : gameEnd.winner === 'right'
                  ? 'يفوز فريق اليمين'
                  : 'يفوز فريق اليسار'}
            </h2>
            <p className={styles.finaleSubtitle}>
              النتيجة النهائية: {formatNumber(gameEnd.rightScore)} -{' '}
              {formatNumber(gameEnd.leftScore)}
            </p>
            <Button type="button" onClick={handleLeave}>
              العودة للألعاب
            </Button>
          </Card>
        )}

        {error && (
          <div className={styles.ladderError} role="alert">
            <div className={styles.errorNotice}>
              <p>{error}</p>
              {guestIdentityInvalid && (
                <div className={styles.errorActions}>
                  <Button type="button" variant="outline" size="sm" onClick={handleRecoverGuest}>
                    تجديد الهوية والمتابعة
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setError('')}>
                    تجاهل
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
        </div>
      </section>
    </MotionScene>
  );
}

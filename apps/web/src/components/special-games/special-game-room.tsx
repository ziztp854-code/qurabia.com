'use client';
import { formatNumber } from '@/lib/utils';

import {
  Check,
  Clipboard,
  Clock3,
  Fingerprint,
  Flame,
  LoaderCircle,
  Orbit,
  Play,
  QrCode as QrCodeIcon,
  RotateCcw,
  Send,
  Sparkles,
  ShieldCheck,
  Trophy,
  UsersRound,
  Vote,
  X,
} from 'lucide-react';
import QRCode from 'react-qr-code';
import { SPECIAL_GAME_META, type SpecialGameMode } from '@tahaddi/domain';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button, ButtonLink, Card, Input } from '@/components/ui';
import { MotionScene } from '@/components/motion/motion-scene';
import { getGameMotionScene } from '@/lib/motion';
import { GameContentGenerator } from '@/components/games/game-content-generator';
import {
  GAME_GUIDES,
  Game3DCard,
  GameConnectionStatus,
  GameHowTo,
  GameSoundToggle,
  useGameSound,
} from '@/components/games/shared';
import { WaitingRoom } from './waiting-room';
import { resolveSpecialGamesRealtimeUrl, useSpecialGameSocket } from './use-special-game-socket';
import type { Player } from './use-special-game-socket';

function riskCardLabel(card: { kind?: string; value?: number }) {
  if (card.kind === 'bomb') return 'قنبلة';
  if (card.kind === 'shield') return 'درع حماية';
  if (card.kind === 'double') return 'مضاعفة البطاقة التالية';
  if (card.kind === 'treasure') return `كنز ${formatNumber(card.value ?? 0)} نقطة`;
  return `${formatNumber(card.value ?? 0)} نقطة`;
}

export { resolveSpecialGamesRealtimeUrl };

/* ------------------------------------------------------------------ */
/* Timer                                                                 */
/* ------------------------------------------------------------------ */

function Timer({ startsAt, timeLimit }: { startsAt: number; timeLimit: number }) {
  const [remaining, setRemaining] = useState(timeLimit);

  useEffect(() => {
    const tick = () => {
      const elapsed = Math.max(0, Date.now() - startsAt) / 1000;
      setRemaining(Math.max(0, Math.ceil(timeLimit - elapsed)));
    };
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [startsAt, timeLimit]);

  return (
    <div className="special-timer" data-warning={remaining <= 8 || undefined}>
      <Clock3 aria-hidden="true" />
      <span>{formatNumber(remaining)}</span>
      <span className="sr-only">ثانية متبقية</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* PlayerRail (in-game sidebar)                                          */
/* ------------------------------------------------------------------ */

function PlayerRail({ players, currentSocketId }: { players: Player[]; currentSocketId?: string }) {
  return (
    <aside className="special-player-rail" aria-label="اللاعبون والترتيب">
      <div className="special-player-rail__title">
        <UsersRound aria-hidden="true" />
        <strong>{formatNumber(players.length)} لاعبين</strong>
      </div>
      {players.length === 0 ? (
        <p className="muted">بانتظار أول لاعب.</p>
      ) : (
        <ol>
          {players.map((player, index) => (
            <li key={player.id} data-current={player.id === currentSocketId || undefined}>
              <span>{formatNumber(index + 1)}</span>
              <strong>{player.name}</strong>
              <b>{formatNumber(player.score)}</b>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Role reveal overlay for infiltrator                                  */
/* ------------------------------------------------------------------ */

function InfiltratorRoleReveal({
  isInfiltrator,
  onContinue,
}: {
  isInfiltrator: boolean;
  onContinue: () => void;
}) {
  return (
    <div
      className="role-reveal"
      data-role={isInfiltrator ? 'infiltrator' : 'majority'}
      data-game="infiltrator"
      role="dialog"
      aria-modal="true"
      aria-labelledby="infiltrator-role-reveal-title"
      aria-describedby="infiltrator-role-reveal-hint"
    >
      <Game3DCard
        flipLabel="اكشف دورك السري"
        front={
          <>
            <Fingerprint className="role-reveal__icon" aria-hidden="true" />
            <h2 className="role-reveal__title" id="infiltrator-role-reveal-title">
              بطاقتك السرية
            </h2>
            <p className="role-reveal__hint">اضغط البطاقة لكشف دورك. لا يراه غيرك.</p>
          </>
        }
        back={
          <>
            <Fingerprint className="role-reveal__icon" aria-hidden="true" />
            <h2 className="role-reveal__title">
              {isInfiltrator ? 'أنت الدخيل 🕵️' : 'أنت من الأغلبية 👥'}
            </h2>
            <p className="role-reveal__hint" id="infiltrator-role-reveal-hint">
              {isInfiltrator
                ? 'ستحصل على سؤال مختلف. تظاهر بأنك من الأغلبية وابقَ بعيداً عن الأضواء.'
                : 'ستحصل على سؤال مشترك. أجب بصدق وحاول اكتشاف الدخيل.'}
            </p>
            <Button variant="gold" size="lg" onClick={onContinue}>
              فهمت — ابدأ
            </Button>
          </>
        }
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Infiltrator end screen (professional)                                */
/* ------------------------------------------------------------------ */

function InfiltratorEndScreen({
  players,
  durationMs,
  activeMode,
  onReplay,
  isHost,
}: {
  players: Player[];
  durationMs: number;
  activeMode: SpecialGameMode;
  onReplay?: () => void;
  isHost: boolean;
}) {
  const winner = players[0];
  const durationMinutes = Math.floor(durationMs / 60000);
  const durationSeconds = Math.round((durationMs % 60000) / 1000);

  return (
    <Card className="special-final-panel infiltrator-end">
      <Trophy className="infiltrator-end__trophy" aria-hidden="true" />
      <div className="infiltrator-end__header">
        <h2>اكتملت اللعبة</h2>
        <p className="infiltrator-end__duration">
          المدة:{' '}
          {durationMinutes > 0
            ? `${formatNumber(durationMinutes)} د ${formatNumber(durationSeconds)} ث`
            : `${formatNumber(durationSeconds)} ثانية`}
        </p>
      </div>

      {winner && (
        <div className="infiltrator-end__mvp">
          <span className="infiltrator-end__mvp-label">MVP 🏆</span>
          <strong className="infiltrator-end__mvp-name">{winner.name}</strong>
          <b className="infiltrator-end__mvp-score">{formatNumber(winner.score)} نقطة</b>
        </div>
      )}

      <ol className="infiltrator-end__scores">
        {players.map((player, index) => (
          <li key={player.id} data-rank={index + 1 <= 3 ? index + 1 : undefined}>
            <span className="infiltrator-end__rank">{formatNumber(index + 1)}</span>
            <strong className="infiltrator-end__pname">{player.name}</strong>
            <b className="infiltrator-end__pscore">{formatNumber(player.score)} نقطة</b>
          </li>
        ))}
      </ol>

      <div className="infiltrator-end__actions">
        {isHost && onReplay && (
          <Button variant="gold" size="lg" onClick={onReplay}>
            <RotateCcw aria-hidden="true" />
            العب مجدداً
          </Button>
        )}
        <ButtonLink href={`/games/${activeMode}`} variant="outline">
          غرفة جديدة
        </ButtonLink>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                        */
/* ------------------------------------------------------------------ */

export function SpecialGameRoom({
  mode,
  initialPin,
}: {
  mode: SpecialGameMode;
  initialPin: string;
}) {
  const meta = SPECIAL_GAME_META[mode];
  const {
    connected,
    connectionFailed,
    socketId,
    room,
    error,
    busy,
    parallelRound,
    parallelAck,
    parallelReveal,
    reverseRound,
    reverseQuestion,
    submittedQuestion,
    voting,
    selectedVote,
    reverseResults,
    infiltratorRound,
    infiltratorAnswer,
    infiltratorVoting,
    infiltratorVote,
    infiltratorGuess,
    infiltratorReveal,
    gameEnd,
    riskState,
    setError,
    setBusy,
    setReverseQuestion,
    socketRef,
    resetRoundState,
  } = useSpecialGameSocket(mode);

  const [joinMode, setJoinMode] = useState(Boolean(initialPin));
  const [pin, setPin] = useState(initialPin);
  const [playerName, setPlayerName] = useState(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('tahaddi-player-name') ?? '';
  });
  const [copied, setCopied] = useState(false);
  const [approvedContentToken, setApprovedContentToken] = useState<string | undefined>();

  // Track last-used pin in localStorage
  const [lastPin] = useState(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('tahaddi-last-pin') ?? '';
  });
  const effectivePin = pin || lastPin;

  // Infiltrator role-reveal gate (tracks the round whose role was acknowledged)
  const [revealedRoundId, setRevealedRoundId] = useState<string | null>(null);

  const { muted, toggleMuted, play } = useGameSound();

  const connectionState = connected ? 'connected' : connectionFailed ? 'failed' : 'connecting';

  // Sound cues (optional; muted state persists locally, no autoplay
  // before the user's first interaction thanks to lazy AudioContext).
  useEffect(() => {
    if (parallelAck) play(parallelAck.correct ? 'correct' : 'select');
  }, [parallelAck, play]);
  useEffect(() => {
    if (gameEnd || parallelReveal || reverseResults || infiltratorReveal) play('result');
  }, [gameEnd, parallelReveal, reverseResults, infiltratorReveal, play]);

  const shareUrl =
    room && typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}?join=${room.pin}`
      : '';
  const isHost = Boolean(room && socketId === room.hostId);
  const currentSocketId = socketId;
  const activeMode = room?.mode ?? mode;
  const activeMeta = SPECIAL_GAME_META[activeMode];

  const nextRound = () => {
    if (!room) return;
    setBusy(true);
    resetRoundState();
    setRevealedRoundId(null);
    socketRef.current?.emit('special:round:next', { pin: room.pin });
  };

  const copyInvite = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  };

  const joinRoom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanPin = effectivePin.replace(/\D/g, '').slice(0, 6);
    if (cleanPin.length !== 6 || playerName.trim().length < 2) {
      setError('أدخل رمزًا من 6 أرقام واسمًا من حرفين على الأقل.');
      return;
    }
    localStorage.setItem('tahaddi-last-pin', cleanPin);
    localStorage.setItem('tahaddi-player-name', playerName.trim());
    setBusy(true);
    setError('');
    socketRef.current?.emit('special:room:join', {
      pin: cleanPin,
      playerName,
    });
  };

  const phaseTitle = useMemo(() => {
    if (!room) return activeMeta.title;
    if (room.phase === 'lobby') return 'غرفة الانتظار';
    if (room.phase === 'parallel-answering') return 'العوالم مفتوحة';
    if (room.phase === 'parallel-reveal') return 'انكشفت العوالم';
    if (room.phase === 'reverse-writing') return 'اصنع السؤال';
    if (room.phase === 'reverse-voting') return 'صوّت للأذكى';
    if (room.phase === 'reverse-results') return 'نتيجة التصويت';
    if (room.phase === 'infiltrator-answering') return 'من هو الدخيل؟';
    if (room.phase === 'infiltrator-voting') return 'اكتشف الدخيل';
    if (room.phase === 'infiltrator-reveal') return 'انكشف الدخيل';
    if (room.phase === 'risk-turn') return 'المجازفة مباشرة';
    return 'النتيجة النهائية';
  }, [activeMeta.title, room]);

  /* ---------------------------------------------------------------- */
  /* Entry screen (no room yet)                                        */
  /* ---------------------------------------------------------------- */

  if (!room) {
    const isValidPin = effectivePin.replace(/\D/g, '').length === 6;
    return (
      <MotionScene scene="intro" sceneKey={`special-${mode}-entry`}>
        <section className="section special-game-entry" data-game={mode}>
          <div className="container">
            <div className="special-game-entry__heading">
              <ButtonLink href="/games" variant="ghost">
                <RotateCcw aria-hidden="true" />
                كل الألعاب
              </ButtonLink>
              <GameConnectionStatus state={connectionState} />
            </div>

            <div className="special-entry-grid">
              <div className="special-entry-copy">
                {mode === 'parallel-world' ? (
                  <Orbit className="special-entry-copy__mark" aria-hidden="true" />
                ) : mode === 'reverse-time' ? (
                  <Clock3 className="special-entry-copy__mark" aria-hidden="true" />
                ) : mode === 'risk' ? (
                  <Flame className="special-entry-copy__mark" aria-hidden="true" />
                ) : (
                  <Fingerprint className="special-entry-copy__mark" aria-hidden="true" />
                )}
                <h1>{meta.title}</h1>
                <p>{meta.description}</p>
                <dl>
                  <div>
                    <dt>الحد الأدنى</dt>
                    <dd>{formatNumber(meta.minimumPlayers)} لاعبين</dd>
                  </div>
                  <div>
                    <dt>وقت الجولة</dt>
                    <dd>
                      {mode === 'risk'
                        ? 'بإدارة المضيف'
                        : `${formatNumber(meta.roundSeconds)} ثانية`}
                    </dd>
                  </div>
                  <div>
                    <dt>المشاركة</dt>
                    <dd>رمز + QR</dd>
                  </div>
                </dl>
              </div>

              <Card className="special-entry-panel">
                <div className="special-entry-tabs" role="tablist" aria-label="طريقة الدخول">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={!joinMode}
                    onClick={() => setJoinMode(false)}
                  >
                    أنشئ غرفة
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={joinMode}
                    onClick={() => setJoinMode(true)}
                  >
                    انضم برمز
                  </button>
                </div>

                {joinMode ? (
                  <form onSubmit={joinRoom} className="special-join-form" noValidate>
                    <Input
                      id="special-player-name"
                      label="اسم اللاعب"
                      value={playerName}
                      onChange={(event) => {
                        setPlayerName(event.target.value);
                        setError('');
                      }}
                      placeholder="الاسم الظاهر في الترتيب"
                      maxLength={30}
                      autoComplete="nickname"
                    />
                    <Input
                      id="special-room-pin"
                      label="رمز الغرفة"
                      value={effectivePin}
                      onChange={(event) => {
                        const cleaned = event.target.value.replace(/\D/g, '').slice(0, 6);
                        setPin(cleaned);
                        setError('');
                      }}
                      placeholder={lastPin || '000000'}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      error={
                        effectivePin && !isValidPin
                          ? 'الرمز يجب أن يكون 6 أرقام'
                          : error || undefined
                      }
                    />
                    <Button
                      type="submit"
                      size="lg"
                      loading={busy}
                      disabled={!connected || busy || !isValidPin || playerName.trim().length < 2}
                    >
                      <Play aria-hidden="true" />
                      ادخل الغرفة
                    </Button>
                  </form>
                ) : (
                  <div className="special-create-room">
                    <QrCodeIcon aria-hidden="true" />
                    <h2>شاشة واحدة للمضيف</h2>
                    <p>
                      سيظهر رمز وQR للضيوف. افتح الرابط من هواتفهم، اكتبوا الأسماء، ثم ابدأ الجولة.
                    </p>
                    {mode !== 'chess' && mode !== 'risk' && (
                      <GameContentGenerator game={mode} onApprove={setApprovedContentToken} />
                    )}
                    <Button
                      variant="gold"
                      size="lg"
                      loading={busy}
                      disabled={!connected || busy}
                      onClick={() => {
                        setBusy(true);
                        setError('');
                        socketRef.current?.emit('special:room:create', {
                          mode,
                          contentToken: approvedContentToken,
                        });
                      }}
                    >
                      <Play aria-hidden="true" />
                      أنشئ الغرفة
                    </Button>
                  </div>
                )}
                {error && (
                  <p className="special-error" role="alert">
                    <X aria-hidden="true" />
                    {error}
                  </p>
                )}
              </Card>
            </div>

            <GameHowTo guide={GAME_GUIDES[mode]} />
          </div>
        </section>
      </MotionScene>
    );
  }

  /* ---------------------------------------------------------------- */
  /* In-room stage                                                      */
  /* ---------------------------------------------------------------- */

  // Show role reveal overlay before infiltrator round begins
  const showRoleReveal =
    room.phase === 'infiltrator-answering' &&
    !isHost &&
    infiltratorRound &&
    revealedRoundId !== infiltratorRound.roundId;

  return (
    <MotionScene scene={getGameMotionScene(room.phase)} sceneKey={`${activeMode}-${room.phase}`}>
      <section className="section special-game-stage" data-game={activeMode}>
        <div className="container">
          <header className="special-stage-header">
            <div>
              <span className="special-stage-header__mode">{activeMeta.title}</span>
              <h1>{phaseTitle}</h1>
            </div>
            <div className="special-stage-header__signals">
              <GameSoundToggle muted={muted} onToggle={toggleMuted} />
              <GameConnectionStatus state={connectionState} compact />
              <span className="special-room-pin">غرفة {room.pin}</span>
            </div>
          </header>

          {/* Role reveal overlay */}
          {showRoleReveal && (
            <InfiltratorRoleReveal
              isInfiltrator={infiltratorRound!.isInfiltrator}
              onContinue={() => {
                if (infiltratorRound) {
                  setRevealedRoundId(infiltratorRound.roundId);
                }
              }}
            />
          )}

          {room.phase === 'lobby' && (
            <div className="special-lobby-grid">
              <Card className="special-invite-panel">
                <div className="special-qr">
                  {shareUrl ? (
                    <QRCode
                      value={shareUrl}
                      size={220}
                      bgColor="var(--qr-paper)"
                      fgColor="var(--qr-ink)"
                      aria-label={`رمز QR للانضمام إلى الغرفة ${room.pin}`}
                    />
                  ) : (
                    <LoaderCircle className="spin" aria-hidden="true" />
                  )}
                </div>
                <div className="special-invite-copy">
                  <span>رمز الدخول</span>
                  <strong dir="ltr">{room.pin}</strong>
                  <p>امسح QR أو افتح رابط الدعوة من جهاز كل لاعب.</p>
                  <Button variant="outline" onClick={copyInvite} disabled={!shareUrl}>
                    {copied ? <Check aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
                    {copied ? 'نُسخ الرابط' : 'انسخ الرابط'}
                  </Button>
                </div>
              </Card>

              <div className="special-lobby-control">
                <WaitingRoom
                  room={room}
                  socketId={currentSocketId}
                  isHost={isHost}
                  meta={activeMeta}
                  busy={busy}
                  socketRef={socketRef}
                  setBusy={setBusy}
                />
              </div>
            </div>
          )}

          {room.phase !== 'lobby' && room.phase !== 'finished' && (
            <div className="special-play-grid">
              <main className="special-round-panel">
                {room.phase === 'risk-turn' && riskState && (
                  <Card className="risk-board">
                    <div className="risk-hud" aria-label="حالة المجازفة">
                      <span>
                        الجولة {formatNumber(riskState.roundNumber)} /{' '}
                        {formatNumber(riskState.roundCount)}
                      </span>
                      <span data-current>
                        الدور:{' '}
                        {room.players.find((player) => player.id === riskState.activePlayerId)
                          ?.name ?? '—'}
                      </span>
                      <span>رصيد الدور {formatNumber(riskState.pot)}</span>
                      {riskState.shield && (
                        <span>
                          <ShieldCheck aria-hidden="true" /> الدرع جاهز
                        </span>
                      )}
                      {riskState.doubleNext && <span>البطاقة التالية ×٢</span>}
                    </div>
                    <div className="risk-dare" role="status" aria-live="polite">
                      <p>{riskState.message}</p>
                      {riskState.awaitingDecision && socketId === riskState.activePlayerId && (
                        <div className="instant-actions">
                          <Button
                            variant="gold"
                            onClick={() =>
                              socketRef.current?.emit('risk:cashout', { pin: room.pin })
                            }
                            aria-label="اكتفِ واجمع الرصيد"
                          >
                            <Check aria-hidden="true" />
                            اكتفِ · +{formatNumber(riskState.pot)}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() =>
                              socketRef.current?.emit('risk:continue', { pin: room.pin })
                            }
                            aria-label="جازف واختر بطاقة أخرى"
                          >
                            <Flame aria-hidden="true" />
                            جازف
                          </Button>
                        </div>
                      )}
                      {isHost && (
                        <Button
                          variant="ghost"
                          onClick={() =>
                            socketRef.current?.emit('risk:turn:skip', { pin: room.pin })
                          }
                        >
                          إنهاء دور اللاعب
                        </Button>
                      )}
                    </div>
                    <div className="risk-grid" role="group" aria-label="بطاقات المجازفة">
                      {riskState.cards.map((card) => {
                        const canSelect =
                          socketId === riskState.activePlayerId && !riskState.awaitingDecision;
                        return (
                          <button
                            type="button"
                            key={card.id}
                            className="risk-card-3d"
                            data-revealed={card.revealed || undefined}
                            data-kind={card.revealed ? card.kind : undefined}
                            aria-label={card.revealed ? riskCardLabel(card) : 'بطاقة مخفية'}
                            disabled={card.revealed || !canSelect}
                            onClick={() =>
                              socketRef.current?.emit('risk:card:select', {
                                pin: room.pin,
                                cardId: card.id,
                              })
                            }
                          >
                            <span className="risk-card-3d__inner">
                              <span className="risk-card-3d__face risk-card-3d__back">
                                <span className="risk-card-3d__seal">
                                  <Flame aria-hidden="true" />
                                </span>
                                <strong className="risk-card-3d__brand">تحدّي</strong>
                                <small>المجازفة</small>
                              </span>
                              <span className="risk-card-3d__face risk-card-3d__front">
                                {card.kind === 'shield' ? (
                                  <ShieldCheck aria-hidden="true" />
                                ) : (
                                  <Flame aria-hidden="true" />
                                )}
                                <b>{card.revealed ? riskCardLabel(card) : ''}</b>
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </Card>
                )}
                {room.phase === 'parallel-answering' &&
                  (isHost ? (
                    <Card className="special-host-monitor">
                      <Orbit aria-hidden="true" />
                      <h2>لكل لاعب عالمه الآن</h2>
                      <p>الأسئلة موزعة سرًا، والإجابة المشتركة لا تظهر حتى تضغط «اكشف العوالم».</p>
                      <Button
                        variant="gold"
                        size="lg"
                        loading={busy}
                        onClick={() => {
                          setBusy(true);
                          socketRef.current?.emit('parallel:reveal', { pin: room.pin });
                        }}
                      >
                        <Sparkles aria-hidden="true" />
                        اكشف العوالم
                      </Button>
                    </Card>
                  ) : parallelRound ? (
                    <Card className="special-question-panel">
                      <div className="special-round-meta">
                        <span>{parallelRound.faceLabel}</span>
                        <span>
                          {formatNumber(parallelRound.roundNumber)} /{' '}
                          {formatNumber(parallelRound.roundCount)}
                        </span>
                        <Timer
                          startsAt={parallelRound.startsAt}
                          timeLimit={parallelRound.timeLimit}
                        />
                      </div>
                      <h2>{parallelRound.prompt}</h2>
                      <div className="special-options">
                        {parallelRound.options.map((option) => {
                          const selected = parallelAck?.selectedAnswer === option;
                          const state = parallelAck
                            ? selected
                              ? parallelAck.correct
                                ? 'success'
                                : 'error'
                              : 'disabled'
                            : busy
                              ? 'loading'
                              : 'default';
                          return (
                            <button
                              type="button"
                              className="special-option"
                              data-state={state}
                              disabled={Boolean(parallelAck) || busy}
                              key={option}
                              onClick={() => {
                                setBusy(true);
                                socketRef.current?.emit('parallel:answer:submit', {
                                  pin: room.pin,
                                  roundId: parallelRound.roundId,
                                  answer: option,
                                });
                              }}
                            >
                              <span>{option}</span>
                              {selected && parallelAck?.correct && <Check aria-hidden="true" />}
                              {selected && parallelAck && !parallelAck.correct && (
                                <X aria-hidden="true" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                      {parallelAck && (
                        <p
                          className={parallelAck.correct ? 'special-success' : 'special-error'}
                          role="status"
                        >
                          {parallelAck.correct
                            ? `إجابة صحيحة +${formatNumber(parallelAck.earned)}`
                            : 'سُجلت الإجابة. انتظر كشف العوالم.'}
                        </p>
                      )}
                    </Card>
                  ) : (
                    <Card className="special-waiting">
                      <LoaderCircle className="spin" aria-hidden="true" />
                      جارٍ فتح عالمك…
                    </Card>
                  ))}

                {room.phase === 'parallel-reveal' && parallelReveal && (
                  <Card className="special-reveal-panel">
                    <span>الإجابة المشتركة</span>
                    <h2>{parallelReveal.answer}</h2>
                    <p>{parallelReveal.reveal}</p>
                    <div className="special-reveal-list">
                      {parallelReveal.results.map((result) => (
                        <article key={result.playerId} data-correct={result.correct || undefined}>
                          <div>
                            <strong>{result.playerName}</strong>
                            <span>{result.faceLabel}</span>
                          </div>
                          <p>{result.prompt}</p>
                          <b>
                            {result.selectedAnswer ?? 'لم يجب'}
                            {result.correct ? (
                              <Check aria-hidden="true" />
                            ) : (
                              <X aria-hidden="true" />
                            )}
                          </b>
                        </article>
                      ))}
                    </div>
                    {isHost && (
                      <Button variant="gold" size="lg" onClick={nextRound} loading={busy}>
                        الجولة التالية
                      </Button>
                    )}
                  </Card>
                )}

                {room.phase === 'reverse-writing' &&
                  (reverseRound ? (
                    <Card className="special-reverse-panel">
                      <div className="special-round-meta">
                        <span>{reverseRound.category}</span>
                        <span>
                          {formatNumber(reverseRound.roundNumber)} /{' '}
                          {formatNumber(reverseRound.roundCount)}
                        </span>
                        <Timer
                          startsAt={reverseRound.startsAt}
                          timeLimit={reverseRound.timeLimit}
                        />
                      </div>
                      <div className="special-reverse-answer">
                        <span>الإجابة ظهرت أولًا</span>
                        <h2>{reverseRound.answer}</h2>
                        <p>{reverseRound.hint}</p>
                      </div>
                      {isHost ? (
                        <div className="special-host-actions">
                          <p>انتظر أسئلة اللاعبين، ثم افتح التصويت عندما يصل سؤالان على الأقل.</p>
                          <Button
                            variant="gold"
                            size="lg"
                            loading={busy}
                            onClick={() => {
                              setBusy(true);
                              socketRef.current?.emit('reverse:voting:start', { pin: room.pin });
                            }}
                          >
                            <Vote aria-hidden="true" />
                            افتح التصويت
                          </Button>
                        </div>
                      ) : submittedQuestion ? (
                        <div className="special-submitted-question" role="status">
                          <Check aria-hidden="true" />
                          <div>
                            <strong>سُجل سؤالك</strong>
                            <p>{submittedQuestion}</p>
                          </div>
                        </div>
                      ) : (
                        <form
                          className="special-question-form"
                          onSubmit={(event) => {
                            event.preventDefault();
                            if (reverseQuestion.trim().length < 8) {
                              setError('اكتب سؤالًا من 8 أحرف على الأقل.');
                              return;
                            }
                            setBusy(true);
                            setError('');
                            socketRef.current?.emit('reverse:question:submit', {
                              pin: room.pin,
                              roundId: reverseRound.roundId,
                              question: reverseQuestion,
                            });
                          }}
                        >
                          <label htmlFor="reverse-question">سؤالك الذكي</label>
                          <textarea
                            id="reverse-question"
                            value={reverseQuestion}
                            onChange={(event) => {
                              setReverseQuestion(event.target.value.slice(0, 180));
                              setError('');
                            }}
                            placeholder="اكتب سؤالًا تكون إجابته المعروضة أعلاه…"
                            aria-invalid={Boolean(error)}
                            aria-describedby={
                              error ? 'reverse-question-error' : 'reverse-question-hint'
                            }
                          />
                          <div className="special-field-hint">
                            <span id={error ? 'reverse-question-error' : 'reverse-question-hint'}>
                              {error || `${formatNumber(reverseQuestion.length)} / 180`}
                            </span>
                          </div>
                          <Button type="submit" size="lg" loading={busy}>
                            <Send aria-hidden="true" />
                            أرسل السؤال
                          </Button>
                        </form>
                      )}
                    </Card>
                  ) : (
                    <Card className="special-waiting">
                      <LoaderCircle className="spin" aria-hidden="true" />
                      جارٍ قلب الزمن…
                    </Card>
                  ))}

                {room.phase === 'reverse-voting' &&
                  (isHost ? (
                    <Card className="special-host-monitor">
                      <Vote aria-hidden="true" />
                      <h2>التصويت مفتوح</h2>
                      <p>كل لاعب يرى الأسئلة بلا أسماء ولا يستطيع التصويت لسؤاله.</p>
                      <Button
                        variant="gold"
                        size="lg"
                        loading={busy}
                        onClick={() => {
                          setBusy(true);
                          socketRef.current?.emit('reverse:reveal', { pin: room.pin });
                        }}
                      >
                        <Trophy aria-hidden="true" />
                        اكشف الفائز
                      </Button>
                    </Card>
                  ) : voting ? (
                    <Card className="special-voting-panel">
                      <span>الإجابة: {voting.answer}</span>
                      <h2>أي سؤال هو الأذكى؟</h2>
                      <div className="special-vote-list">
                        {voting.submissions.map((submission) => (
                          <button
                            type="button"
                            key={submission.id}
                            disabled={submission.isOwn || Boolean(selectedVote) || busy}
                            data-selected={selectedVote === submission.id || undefined}
                            onClick={() => {
                              setBusy(true);
                              socketRef.current?.emit('reverse:vote', {
                                pin: room.pin,
                                submissionId: submission.id,
                              });
                            }}
                          >
                            <span>{submission.text}</span>
                            {submission.isOwn ? <small>سؤالك</small> : <Vote aria-hidden="true" />}
                          </button>
                        ))}
                      </div>
                    </Card>
                  ) : (
                    <Card className="special-waiting">
                      <LoaderCircle className="spin" aria-hidden="true" />
                      جارٍ تجهيز بطاقات التصويت…
                    </Card>
                  ))}

                {room.phase === 'reverse-results' && reverseResults && (
                  <Card className="special-results-panel">
                    <Trophy aria-hidden="true" />
                    <span>الإجابة: {reverseResults.answer}</span>
                    <h2>السؤال الأذكى</h2>
                    <ol>
                      {reverseResults.results.map((result, index) => (
                        <li key={result.id}>
                          <b>{formatNumber(index + 1)}</b>
                          <div>
                            <strong>{result.text}</strong>
                            <span>{result.playerName}</span>
                          </div>
                          <em>{formatNumber(result.votes)} أصوات</em>
                        </li>
                      ))}
                    </ol>
                    {isHost && (
                      <Button variant="gold" size="lg" onClick={nextRound} loading={busy}>
                        الجولة التالية
                      </Button>
                    )}
                  </Card>
                )}

                {room.phase === 'infiltrator-answering' &&
                  (isHost ? (
                    <Card className="special-host-monitor">
                      <Fingerprint aria-hidden="true" />
                      <h2>وُزّعت الأدوار سرًا</h2>
                      <p>
                        الأغلبية ترى سؤالًا واحدًا، والدخيل يرى سؤالًا مختلفًا. لا تكشف الأسئلة.
                      </p>
                      <Button
                        variant="gold"
                        size="lg"
                        loading={busy}
                        onClick={() => {
                          setBusy(true);
                          socketRef.current?.emit('infiltrator:voting:start', { pin: room.pin });
                        }}
                      >
                        <Vote aria-hidden="true" />
                        اعرض الإجابات المجهولة
                      </Button>
                    </Card>
                  ) : infiltratorRound && revealedRoundId === infiltratorRound.roundId ? (
                    <Card className="special-question-panel">
                      <div className="special-round-meta">
                        <span
                          data-role={infiltratorRound.isInfiltrator ? 'infiltrator' : 'majority'}
                        >
                          {infiltratorRound.isInfiltrator ? 'أنت الدخيل' : 'أنت من الأغلبية'}
                        </span>
                        <span>
                          {formatNumber(infiltratorRound.roundNumber)} /{' '}
                          {formatNumber(infiltratorRound.roundCount)}
                        </span>
                        <Timer
                          startsAt={infiltratorRound.startsAt}
                          timeLimit={infiltratorRound.timeLimit}
                        />
                      </div>
                      <p className="special-role-hint">
                        {infiltratorRound.isInfiltrator
                          ? 'تظاهر أن سؤالك هو سؤال الجميع، ثم حاول النجاة من التصويت.'
                          : 'أجب طبيعيًا، ثم راقب الإجابات لتكتشف صاحب السؤال المختلف.'}
                      </p>
                      <h2>{infiltratorRound.prompt}</h2>
                      <div className="special-options">
                        {infiltratorRound.options.map((option) => (
                          <button
                            type="button"
                            className="special-option"
                            data-state={
                              infiltratorAnswer
                                ? infiltratorAnswer === option
                                  ? 'success'
                                  : 'disabled'
                                : busy
                                  ? 'loading'
                                  : 'default'
                            }
                            disabled={Boolean(infiltratorAnswer) || busy}
                            key={option}
                            onClick={() => {
                              setBusy(true);
                              socketRef.current?.emit('infiltrator:answer:submit', {
                                pin: room.pin,
                                roundId: infiltratorRound.roundId,
                                answer: option,
                              });
                            }}
                          >
                            <span>{option}</span>
                            {infiltratorAnswer === option && <Check aria-hidden="true" />}
                          </button>
                        ))}
                      </div>
                      {infiltratorAnswer && (
                        <p className="special-success" role="status">
                          سُجلت إجابتك. لا تشرح سؤالك الآن.
                        </p>
                      )}
                    </Card>
                  ) : showRoleReveal ? null : (
                    <Card className="special-waiting">
                      <LoaderCircle className="spin" aria-hidden="true" />
                      جارٍ تسليم دورك السري…
                    </Card>
                  ))}

                {room.phase === 'infiltrator-voting' &&
                  (isHost ? (
                    <Card className="special-host-monitor">
                      <Vote aria-hidden="true" />
                      <h2>التصويت سري ومفتوح</h2>
                      <p>تظهر الإجابات بلا أسماء. يحاول الدخيل بالتوازي تخمين إجابة الأغلبية.</p>
                      <Button
                        variant="gold"
                        size="lg"
                        loading={busy}
                        onClick={() => {
                          setBusy(true);
                          socketRef.current?.emit('infiltrator:reveal', { pin: room.pin });
                        }}
                      >
                        <Fingerprint aria-hidden="true" />
                        اكشف الدخيل
                      </Button>
                    </Card>
                  ) : infiltratorVoting ? (
                    <Card className="special-voting-panel">
                      <span>الإجابات مجهولة الهوية</span>
                      <h2>أي إجابة جاءت من سؤال مختلف؟</h2>
                      <div className="special-vote-list">
                        {infiltratorVoting.answers.map((answer) => (
                          <button
                            type="button"
                            key={answer.playerId}
                            disabled={answer.isOwn || Boolean(infiltratorVote) || busy}
                            data-selected={infiltratorVote === answer.playerId || undefined}
                            onClick={() => {
                              setBusy(true);
                              socketRef.current?.emit('infiltrator:vote', {
                                pin: room.pin,
                                playerId: answer.playerId,
                              });
                            }}
                          >
                            <span>{answer.answer}</span>
                            {answer.isOwn ? <small>إجابتك</small> : <Vote aria-hidden="true" />}
                          </button>
                        ))}
                      </div>
                      {infiltratorVoting.isInfiltrator && (
                        <div className="special-majority-guess">
                          <strong>فرصتك الثانية: أي سؤال ظهر للأغلبية؟</strong>
                          <div className="special-options">
                            {infiltratorVoting.majorityOptions.map((option) => (
                              <button
                                type="button"
                                className="special-option"
                                key={option}
                                disabled={Boolean(infiltratorGuess) || busy}
                                data-state={
                                  infiltratorGuess === option
                                    ? 'success'
                                    : infiltratorGuess
                                      ? 'disabled'
                                      : 'default'
                                }
                                onClick={() => {
                                  setBusy(true);
                                  socketRef.current?.emit('infiltrator:majority:guess', {
                                    pin: room.pin,
                                    question: option,
                                  });
                                }}
                              >
                                <span>{option}</span>
                                {infiltratorGuess === option && <Check aria-hidden="true" />}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </Card>
                  ) : (
                    <Card className="special-waiting">
                      <LoaderCircle className="spin" aria-hidden="true" />
                      جارٍ إخفاء هويات الإجابات…
                    </Card>
                  ))}

                {room.phase === 'infiltrator-reveal' && infiltratorReveal && (
                  <Card className="special-results-panel">
                    <Fingerprint aria-hidden="true" />
                    <span>
                      {infiltratorReveal.infiltratorWon ? 'فاز الدخيل' : 'أمسكتم بالدخيل'}
                    </span>
                    <h2>الدخيل هو {infiltratorReveal.infiltratorName}</h2>
                    <p>
                      {infiltratorReveal.guessedMajority
                        ? `وخمّن سؤال الأغلبية: ${infiltratorReveal.majorityQuestion}`
                        : `لم يخمّن سؤال الأغلبية: ${infiltratorReveal.majorityQuestion}`}
                    </p>
                    <ol>
                      {infiltratorReveal.answers.map((answer) => (
                        <li key={answer.playerId}>
                          <b>{formatNumber(infiltratorReveal.voteCounts[answer.playerId] ?? 0)}</b>
                          <div>
                            <strong>{answer.answer}</strong>
                            <span>
                              {answer.playerName}
                              {answer.playerId === infiltratorReveal.infiltratorId
                                ? ' — الدخيل'
                                : ''}
                            </span>
                          </div>
                          <em>أصوات</em>
                        </li>
                      ))}
                    </ol>
                    {isHost && (
                      <Button variant="gold" size="lg" onClick={nextRound} loading={busy}>
                        الجولة التالية
                      </Button>
                    )}
                  </Card>
                )}
              </main>
              <PlayerRail players={room.players} currentSocketId={currentSocketId} />
            </div>
          )}

          {(room.phase === 'finished' || gameEnd) &&
            (activeMode === 'infiltrator' ? (
              <InfiltratorEndScreen
                players={gameEnd?.players ?? room.players}
                durationMs={gameEnd?.durationMs ?? 0}
                activeMode={activeMode}
                isHost={isHost}
                onReplay={
                  isHost
                    ? () => {
                        setBusy(true);
                        socketRef.current?.emit('special:game:start', { pin: room.pin });
                      }
                    : undefined
                }
              />
            ) : (
              <Card className="special-final-panel">
                <Trophy aria-hidden="true" />
                <h2>اكتملت اللعبة</h2>
                <p>انتهت جولات {activeMeta.title}. هذا هو الترتيب النهائي.</p>
                <ol>
                  {(gameEnd?.players ?? room.players).map((player, index) => (
                    <li key={player.id}>
                      <span>{formatNumber(index + 1)}</span>
                      <strong>{player.name}</strong>
                      <b>{formatNumber(player.score)} نقطة</b>
                    </li>
                  ))}
                </ol>
                <ButtonLink href={`/games/${activeMode}`} variant="gold">
                  <RotateCcw aria-hidden="true" />
                  غرفة جديدة
                </ButtonLink>
              </Card>
            ))}

          {error && room.phase !== 'reverse-writing' && (
            <p className="special-error special-stage-error" role="alert">
              <X aria-hidden="true" />
              {error}
            </p>
          )}
        </div>
      </section>
    </MotionScene>
  );
}

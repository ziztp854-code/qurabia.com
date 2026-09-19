'use client';

import {
  BookOpen,
  Check,
  Club,
  Copy,
  Crown,
  Diamond,
  Heart,
  LogIn,
  LogOut,
  Play,
  Radio,
  ShieldCheck,
  Spade,
  Sparkles,
  Sun,
  UserPlus,
  UsersRound,
  Wifi,
  WifiOff,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import Image from 'next/image';
import { useMemo, useState } from 'react';
import { Button, Card, Input } from '@/components/ui';
import { formatNumber } from '@/lib/utils';
import { balootBidLabel, handFanDegrees, sortHandForDisplay } from './baloot-hand-display';
import { PlayingCardFace, suitName } from './playing-card-face';
import { type BalootCard, type BalootSuit, useBalootSocket } from './use-baloot-socket';
import { BALOOT_RULES, getLegalPlays, type Contract } from '@tahaddi/domain';
import styles from './baloot-room.module.css';

/**
 * Tahaddi-specific suit names. The engine never reads these strings; the
 * UI is the only place that touches them, so renaming them later is a
 * pure-display change.
 */
const TAHADDI_SUIT: Record<BalootSuit, { label: string; name: string; Icon: LucideIcon }> = {
  spades: { label: '♠', name: 'السبيت', Icon: Spade },
  hearts: { label: '♥', name: 'الشيريا', Icon: Heart },
  clubs: { label: '♣', name: 'الهاص', Icon: Club },
  diamonds: { label: '♦', name: 'الديمن', Icon: Diamond },
};

const positions = ['south', 'west', 'north', 'east'] as const;
const seatLabels = ['أنت', 'الخصم الأيمن', 'الشريك', 'الخصم الأيسر'] as const;
const TABLE_ART = {
  src: '/game-art/baloot-table-felt.webp',
  // P0-1 follow-up: the felt is now forced to a 1:1 aspect-ratio, so the
  // table reads as a true circle, not an oval.
  alt: 'طاولة بلوت دائرية بخضرة الزمرد وإطار ذهبي',
} as const;

/* Fix #12: deterministic avatar palette derived from the player name so
 * each seat has a recognisable chip. Avoids the "every player is و" problem
 * of using only the first character. */
const SEAT_PALETTE = [
  'rgb(245 184 46 / 0.32)', // gold
  'rgb(34 197 94 / 0.28)', // emerald
  'rgb(59 130 246 / 0.28)', // azure
  'rgb(168 85 247 / 0.28)', // violet
  'rgb(244 114 182 / 0.28)', // rose
  'rgb(249 115 22 / 0.28)', // amber
] as const;
const OPPONENT_PALETTE = [
  'rgb(225 29 72 / 0.32)',
  'rgb(239 68 68 / 0.3)',
  'rgb(217 119 6 / 0.3)',
  'rgb(220 38 38 / 0.28)',
] as const;

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function seatInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '؟';
  // Use up to two grapheme-safe characters. Falls back to a single letter if
  // the name is too short for two.
  return Array.from(trimmed).slice(0, 2).join('');
}

function seatAvatarColor(name: string, isOurs: boolean): string {
  const palette = isOurs ? SEAT_PALETTE : OPPONENT_PALETTE;
  return palette[hashName(name) % palette.length]!;
}

/* Fix #15: deterministic per-trick rotation that scales to any number of
 * cards (was a hard-coded 4-entry array that looped modulo for 5+). */
function trickAngle(index: number, total: number): number {
  if (total <= 1) return 0;
  // Spread evenly across [-8deg, 8deg] with a small pseudo-random offset
  // derived from the index so consecutive hands look organic.
  const spread = 8;
  const base = (index - (total - 1) / 2) * (spread / Math.max(1, total - 1)) * 2;
  const jitter = ((index * 37) % 5) - 2; // -2..+2 deterministic jitter
  return Number((base + jitter).toFixed(2));
}

const previewCards: Array<Pick<BalootCard, 'rank' | 'suit'>> = [
  { rank: 'A', suit: 'spades' },
  { rank: '10', suit: 'hearts' },
  { rank: 'K', suit: 'diamonds' },
  { rank: 'J', suit: 'clubs' },
];

function commandId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function multiplierLabel(multiplier: 1 | 2 | 3 | 4) {
  return multiplier === 1
    ? 'بدون مضاعفة'
    : multiplier === 2
      ? 'دبل'
      : multiplier === 3
        ? 'تريبل'
        : 'فور';
}

function BalootRulesModal({ onClose }: { onClose: () => void }) {
  const { cardRawPoints, gameRoundPoints, matchTarget, projectGamePoints, rawRoundPoints } =
    BALOOT_RULES;

  return (
    <div
      className={styles.rulesBackdrop}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="دليل قوانين البلوت"
    >
      <div className={styles.rulesModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.rulesHeader}>
          <h3>🃏 دليل وقوانين البلوت الملكية</h3>
          <button type="button" className={styles.rulesClose} onClick={onClose} aria-label="إغلاق">
            <X aria-hidden="true" />
          </button>
        </div>
        <div className={styles.rulesGrid}>
          <div className={styles.rulesCard}>
            <h4>👑 ترتيب قوة الورق</h4>
            <ul>
              <li>
                <strong>في الصن (Sun):</strong> A &gt; 10 &gt; K &gt; Q &gt; J &gt; 9 &gt; 8 &gt; 7
              </li>
              <li>
                <strong>في الحكم (لون الحكم):</strong> J &gt; 9 &gt; A &gt; 10 &gt; K &gt; Q &gt; 8
                &gt; 7
              </li>
              <li>
                <strong>في الحكم (الألوان العادية):</strong> A &gt; 10 &gt; K &gt; Q &gt; J &gt; 9
                &gt; 8 &gt; 7
              </li>
            </ul>
          </div>
          <div className={styles.rulesCard}>
            <h4>💎 قيمة الأبناط (حساب الورق)</h4>
            <ul>
              <li>
                <strong>الصن:</strong> A = {formatNumber(cardRawPoints.sun.A)}، 10 ={' '}
                {formatNumber(cardRawPoints.sun['10'])}، K = {formatNumber(cardRawPoints.sun.K)}، Q
                = {formatNumber(cardRawPoints.sun.Q)}، J = {formatNumber(cardRawPoints.sun.J)}{' '}
                (إجمالي الورق الخام مع الأرض = {formatNumber(rawRoundPoints.sun)}، ويُحوّل إلى{' '}
                {formatNumber(gameRoundPoints.sun)} بنطًا).
              </li>
              <li>
                <strong>الحكم:</strong> J = {formatNumber(cardRawPoints.hokum.J)}، 9 ={' '}
                {formatNumber(cardRawPoints.hokum['9'])}، A = {formatNumber(cardRawPoints.hokum.A)}،
                10 = {formatNumber(cardRawPoints.hokum['10'])}، K ={' '}
                {formatNumber(cardRawPoints.hokum.K)}، Q = {formatNumber(cardRawPoints.hokum.Q)}
                (إجمالي الورق الخام مع الأرض = {formatNumber(rawRoundPoints.hokum)}، ويُحوّل إلى{' '}
                {formatNumber(gameRoundPoints.hokum)} بنطًا).
              </li>
            </ul>
          </div>
          <div className={styles.rulesCard}>
            <h4>🏆 المشاريع (تُكشف في الأكلة الأولى)</h4>
            <ul>
              <li>
                <strong>سرا (3 كروت متتالية):</strong>{' '}
                {formatNumber(projectGamePoints.run.hokum[3])} في الحكم /{' '}
                {formatNumber(projectGamePoints.run.sun[3])} في الصن.
              </li>
              <li>
                <strong>خمسين (4 كروت متتالية):</strong>{' '}
                {formatNumber(projectGamePoints.run.hokum[4])} في الحكم /{' '}
                {formatNumber(projectGamePoints.run.sun[4])} في الصن.
              </li>
              <li>
                <strong>مية (5 كروت أو 4 متشابهة من 10، Q، K، A):</strong>{' '}
                {formatNumber(projectGamePoints.run.hokum[5])} في الحكم /{' '}
                {formatNumber(projectGamePoints.run.sun[5])} في الصن.
              </li>
              <li>
                <strong>أربعمية (4 إكك A):</strong>{' '}
                {formatNumber(projectGamePoints.fourOfKind.sun.A)} في الصن.
              </li>
              <li>
                <strong>بلوت (شايب وبنت الحكم):</strong>{' '}
                {formatNumber(BALOOT_RULES.balootGamePoints)} في الحكم (لا تُبطل).
              </li>
            </ul>
          </div>
          <div className={styles.rulesCard}>
            <h4>⚡ قوانين اللعب والفوز بالصكة</h4>
            <ul>
              <li>
                <strong>إجبارية اتباع اللون:</strong> يجب لعب نفس لون الورقة الأولى إن كان متاحاً في
                يدك.
              </li>
              <li>
                <strong>الدق بالحكم:</strong> في عقد الحكم إذا لم يكن لديك اللون الملعوب، يُجبر
                اللاعب على الدق بورقة حكم.
              </li>
              <li>
                <strong>الفوز بالمباراة:</strong> أول فريق يجمع {formatNumber(matchTarget)} بنطًا
                يفوز.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayingCard({
  card,
  enabled,
  onPlay,
}: {
  card: BalootCard;
  enabled: boolean;
  onPlay?: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.playingCard}
      disabled={!enabled}
      onClick={onPlay}
      aria-label={`${card.rank} ${suitName(card.suit)}${enabled ? '، العب الورقة' : ''}`}
    >
      <PlayingCardFace card={card} />
    </button>
  );
}

function BalootPreview({ onOpenRules }: { onOpenRules: () => void }) {
  return (
    <section className={styles.previewBoard} aria-label="معاينة الورق وطريقة الجلوس">
      <div className={styles.previewTable} aria-label="جلسة أربعة لاعبين">
        <Image
          src={TABLE_ART.src}
          alt={TABLE_ART.alt}
          fill
          sizes="(min-width: 48rem) 22rem, 90vw"
          className={styles.previewTableArt}
          priority
        />
        <span className={styles.previewSeat} data-position="north" data-team="us">
          الشريك
          <small>فريقنا</small>
        </span>
        <span className={styles.previewSeat} data-position="west" data-team="them">
          الخصم الأيمن
          <small>خصم</small>
        </span>
        <span className={styles.previewSeat} data-position="east" data-team="them">
          الخصم الأيسر
          <small>خصم</small>
        </span>
        <span className={styles.previewSeat} data-position="south" data-team="us">
          أنت
          <small>فريقنا</small>
        </span>
        <div className={styles.previewCenter}>
          <span>جلسة أربعة</span>
          <strong>الشريك مقابلك</strong>
        </div>
      </div>
      <div className={styles.previewHand} aria-label="معاينة الورق">
        <div className={styles.previewHandHeader}>
          <span>معاينة الورق</span>
          <button type="button" className={styles.rulesButton} onClick={onOpenRules}>
            <BookOpen aria-hidden="true" />
            دليل القوانين
          </button>
        </div>
        <div className={styles.previewFan} dir="ltr">
          {previewCards.map((card) => (
            <i key={`${card.rank}-${card.suit}`}>
              <PlayingCardFace card={card} />
              <span className="sr-only">
                {card.rank} {suitName(card.suit)}
              </span>
            </i>
          ))}
        </div>
      </div>
    </section>
  );
}

function connectionStatusCopy(
  connected: boolean,
  latencyMs: number | null,
  quality: 'offline' | 'excellent' | 'good' | 'slow',
) {
  if (!connected) return 'جارٍ الاتصال بخادم اللعب';
  if (latencyMs === null) return 'خادم اللعب متصل · WebSocket';
  const qualityLabel = quality === 'excellent' ? 'سريع جداً' : quality === 'good' ? 'جيد' : 'بطيء';
  return `اتصال ${qualityLabel} · ${formatNumber(latencyMs)} ملّي ثانية`;
}

export function BalootRoom() {
  const {
    connected,
    latencyMs,
    connectionQuality,
    busy,
    restoring,
    error,
    room,
    emit,
    leave,
    clearError,
  } = useBalootSocket();
  const [joinMode, setJoinMode] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [handWarning, setHandWarning] = useState('');
  const networkStatus = connectionStatusCopy(connected, latencyMs, connectionQuality);

  const seats = useMemo(() => {
    if (!room) return [];
    return Array.from({ length: 4 }, (_, seatIndex) => {
      const seat = room.seats.find((candidate) => candidate.seat === seatIndex);
      return {
        seat,
        seatIndex,
        label: seatLabels[(seatIndex - room.yourSeat + 4) % 4],
        position: positions[(seatIndex - room.yourSeat + 4) % 4],
        team: seatIndex % 2 === 0 ? 'A' : 'B',
      };
    });
  }, [room]);

  if (!room) {
    return (
      <>
        {showRules && <BalootRulesModal onClose={() => setShowRules(false)} />}
        <Card className={`${styles.shell} ${styles.lobbyShell}`}>
          <section className={styles.lobbyIntro}>
            <span className={styles.ruleset}>
              <ShieldCheck aria-hidden="true" />
              خادم موثوق · أربعة لاعبين
            </span>
            <h2>البلوت الملكية</h2>
            <p>
              أنشئ مجلساً خاصاً أو ادخل برمز من ستة أرقام. أربعة مقاعد حول الطاولة: أنت والشريك
              مقابل بعض، والخصمان عن اليمين واليسار.
            </p>
            <BalootPreview onOpenRules={() => setShowRules(true)} />
            <div
              className={styles.liveStatus}
              data-connected={connected || undefined}
              data-quality={connectionQuality}
              role="status"
              aria-live="polite"
            >
              {connected ? <Wifi aria-hidden="true" /> : <WifiOff aria-hidden="true" />}
              {restoring ? 'جارٍ استعادة مقعدك في المجلس' : networkStatus}
            </div>
          </section>

          <form
            className={styles.lobbyForm}
            onSubmit={(event) => {
              event.preventDefault();
              if (joinMode) {
                emit('baloot:join', { roomCode: roomCode.trim(), playerName: playerName.trim() });
              } else {
                emit('baloot:host', { playerName: playerName.trim() });
              }
            }}
          >
            <div className={styles.joinTabs} role="group" aria-label="طريقة الدخول">
              <button type="button" aria-pressed={!joinMode} onClick={() => setJoinMode(false)}>
                مجلس جديد
              </button>
              <button type="button" aria-pressed={joinMode} onClick={() => setJoinMode(true)}>
                دخول برمز
              </button>
            </div>
            <Input
              label="اسم اللاعب"
              name="playerName"
              autoComplete="nickname"
              value={playerName}
              onChange={(event) => {
                setPlayerName(event.target.value);
                if (error) clearError();
              }}
              minLength={2}
              maxLength={30}
              required
            />
            {joinMode ? (
              <Input
                label="رمز المجلس"
                name="roomCode"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={roomCode}
                onChange={(event) => {
                  setRoomCode(event.target.value.replace(/\D/g, '').slice(0, 6));
                  if (error) clearError();
                }}
                minLength={6}
                maxLength={6}
                required
                dir="ltr"
              />
            ) : null}
            <Button
              type="submit"
              variant="gold"
              size="lg"
              disabled={!connected || busy || restoring}
              title={
                !connected
                  ? 'بانتظار الاتصال بالخادم'
                  : restoring
                    ? 'جارٍ استعادة مقعدك'
                    : busy
                      ? 'جارٍ تجهيز المجلس'
                      : undefined
              }
            >
              {joinMode ? <LogIn aria-hidden="true" /> : <Crown aria-hidden="true" />}
              {busy ? 'جارٍ تجهيز المجلس' : joinMode ? 'ادخل المجلس' : 'أنشئ مجلساً'}
            </Button>
            {!connected ? (
              <p className={styles.error} role="status" aria-live="polite">
                انقطع الاتصال بالخادم. ستُفعَّل الأفعال فور عودة الشبكة.
              </p>
            ) : null}
            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
          </form>
        </Card>
      </>
    );
  }

  const self = room.seats.find((seat) => seat.seat === room.yourSeat)!;
  const isYourTurn = room.turn === room.yourSeat;
  const contractLabel = room.contract
    ? room.contract.mode.mode === 'sun'
      ? 'صن'
      : `حكم ${TAHADDI_SUIT[room.contract.mode.trump].name} (${TAHADDI_SUIT[room.contract.mode.trump].label})`
    : 'بانتظار الشراء';

  return (
    <>
      {showRules && <BalootRulesModal onClose={() => setShowRules(false)} />}
      <Card className={styles.shell}>
        <section className={styles.table} aria-label="طاولة بلوت مباشرة">
          <header className={styles.roomHeader}>
            <div>
              <span className={styles.ruleset}>
                <Radio aria-hidden="true" /> مجلس مباشر
              </span>
              <h2>طاولة البلوت</h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <button
                type="button"
                className={styles.rulesButton}
                onClick={() => setShowRules(true)}
                aria-label="القوانين"
              >
                <BookOpen aria-hidden="true" />
                القوانين
              </button>
              <div className={styles.roomCode}>
                <span>رمز المجلس:</span>
                <strong dir="ltr">{room.roomCode}</strong>
                <button
                  type="button"
                  aria-label="نسخ رمز المجلس"
                  onClick={() => {
                    void navigator.clipboard.writeText(room.roomCode);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                </button>
              </div>
            </div>
          </header>

          <div className={styles.phaseRail} aria-label="حالة المباراة">
            <span data-current>
              <span aria-hidden="true">●</span>
              {room.phase === 'LOBBY'
                ? 'بانتظار اللاعبين'
                : room.phase === 'READY'
                  ? 'الجميع جاهز'
                  : room.phase === 'DEALING'
                    ? 'توزيع الورق'
                    : room.phase === 'BIDDING'
                      ? room.auctionRound === 1
                        ? 'مرحلة الشراء'
                        : 'حكم ثاني'
                      : room.phase === 'DOUBLING'
                        ? 'مرحلة الدبل'
                        : room.phase === 'PLAYING'
                          ? 'اللعب جاري'
                          : room.phase === 'TRICK_RESULT'
                            ? 'حسم الأكلة'
                            : room.phase === 'ROUND_RESULT'
                              ? 'نهاية الصكة'
                              : 'انتهت اللعبة'}
            </span>
            <span>
              <UsersRound aria-hidden="true" />
              {formatNumber(room.seats.length)}/{formatNumber(4)} لاعبين
            </span>
            <span>
              <ShieldCheck aria-hidden="true" />
              مجلس خاص
            </span>
            <span data-quality={connectionQuality} role="status" aria-live="polite">
              {connected ? <Wifi aria-hidden="true" /> : <WifiOff aria-hidden="true" />}
              {networkStatus}
            </span>
          </div>

          {(room.phase === 'BIDDING' ||
            room.phase === 'DOUBLING' ||
            room.phase === 'PLAYING' ||
            room.phase === 'TRICK_RESULT') &&
          room.yourHand.length > 0 ? (
            <div className={styles.roundInfo} aria-label="معلومات الجولة">
              <span className={styles.roundInfoScore}>
                <em>لنا</em>
                <strong>{formatNumber(room.scores[0])}</strong>
                <small>·</small>
                <em>لهم</em>
                <strong>{formatNumber(room.scores[1])}</strong>
              </span>
              <span className={styles.roundInfoPipe}>|</span>
              <span className={styles.roundInfoContract}>
                {room.contract ? (
                  room.contract.mode.mode === 'sun' ? (
                    <>صن</>
                  ) : (
                    <>
                      حكم {TAHADDI_SUIT[room.contract.mode.trump].label}{' '}
                      {TAHADDI_SUIT[room.contract.mode.trump].name}
                    </>
                  )
                ) : (
                  <em>بانتظار العقد</em>
                )}
                {room.contract && room.contract.multiplier > 1 ? (
                  <em className={styles.roundInfoMultiplier}>
                    {' '}
                    · {multiplierLabel(room.contract.multiplier)} ×
                    {formatNumber(room.contract.multiplier)}
                  </em>
                ) : null}
              </span>
              {room.contract ? (
                <>
                  <span className={styles.roundInfoPipe}>|</span>
                  <span>
                    المشتري:{' '}
                    <strong>
                      {room.seats.find((seat) => seat.seat === room.buyerPlayerId)?.playerName ??
                        '—'}
                    </strong>
                  </span>
                </>
              ) : null}
              <span className={styles.roundInfoPipe}>|</span>
              <span>
                الدور:{' '}
                <strong>
                  {room.seats.find((seat) => seat.seat === room.turn)?.playerName ?? '—'}
                </strong>
              </span>
            </div>
          ) : null}

          <div className={styles.felt} data-phase={room.phase}>
            <Image
              src={TABLE_ART.src}
              alt=""
              fill
              sizes="(min-width: 68rem) 56rem, 100vw"
              className={styles.feltArt}
              priority
            />
            {seats.map(({ seat, seatIndex, label, position, team }) => (
              <div
                key={seatIndex}
                className={styles.seat}
                data-position={position}
                data-team={team === room.yourTeam ? 'لنا' : 'لهم'}
                data-active={seat && room.turn === seat.seat ? true : undefined}
                data-empty={!seat || undefined}
              >
                <span
                  className={styles.seatIcon}
                  aria-hidden="true"
                  style={
                    seat
                      ? { background: seatAvatarColor(seat.playerName, team === room.yourTeam) }
                      : undefined
                  }
                >
                  {seat ? seatInitials(seat.playerName) : <UsersRound aria-hidden="true" />}
                </span>
                <strong>{seat ? seat.playerName : label}</strong>
                <small>
                  {seat
                    ? `فريق ${team === room.yourTeam ? 'لنا' : 'لهم'} · ${seat.connected ? 'متصل' : 'منقطع'}`
                    : 'بانتظار لاعب'}
                </small>
                <div className={styles.seatBadges}>
                  {seat?.isHost ? (
                    <span>
                      <Crown aria-hidden="true" style={{ width: '0.75rem', height: '0.75rem' }} />
                      المضيف
                    </span>
                  ) : null}
                  {seat?.ready ? (
                    <span>
                      <Check aria-hidden="true" style={{ width: '0.75rem', height: '0.75rem' }} />
                      جاهز
                    </span>
                  ) : null}
                  {seat && room.turn === seat.seat ? (
                    <span>
                      <Sparkles
                        aria-hidden="true"
                        style={{ width: '0.75rem', height: '0.75rem' }}
                      />
                      الدور
                    </span>
                  ) : null}
                  {/* Fix #13: invite affordance for empty seats. */}
                  {!seat ? (
                    <span>
                      <UserPlus
                        aria-hidden="true"
                        style={{ width: '0.75rem', height: '0.75rem' }}
                      />
                      مقعد شاغر · ادعُ صديقاً
                    </span>
                  ) : null}
                </div>
              </div>
            ))}

            <div className={styles.centerStack} aria-live="polite">
              <div className={styles.trickCards}>
                {room.currentTrick.map((play, index) => {
                  // Fix #15: dynamic per-card rotation that scales to any
                  // number of cards (was a hard-coded 4-entry array).
                  const angle = trickAngle(index, room.currentTrick.length);
                  return (
                    <div
                      key={`${play.seat}-${play.card.id}`}
                      className={styles.trickCard}
                      style={{ transform: `rotate(${angle}deg)` }}
                      // Fix #14: simplify the screen-reader label; the visible
                      // tag below already names the seat, so the aria-label
                      // only needs the card identity.
                      aria-label={`${play.card.rank} ${suitName(play.card.suit)}`}
                    >
                      <span className={styles.trickCardTag}>
                        مقعد {formatNumber(play.seat + 1)}
                      </span>
                      <PlayingCardFace card={play.card} />
                    </div>
                  );
                })}
              </div>
              <div className={styles.centerContractPill}>
                <span>
                  {room.phase === 'PLAYING'
                    ? isYourTurn
                      ? 'دورك الآن للعب'
                      : 'بانتظار رمي الورقة'
                    : 'العقد الحالي'}
                </span>
                <strong>{contractLabel}</strong>
              </div>
            </div>
          </div>

          {room.phase === 'LOBBY' || room.phase === 'READY' ? (
            <div className={styles.actionPanel}>
              <Button
                variant={self.ready ? 'outline' : 'gold'}
                onClick={() => emit('baloot:ready', { ready: !self.ready })}
                disabled={busy}
              >
                <Check aria-hidden="true" />
                {self.ready ? 'إلغاء الجاهزية' : 'أنا جاهز'}
              </Button>
              {self.isHost ? (
                <Button
                  variant="gold"
                  onClick={() => emit('baloot:start', {})}
                  disabled={busy || room.phase !== 'READY'}
                >
                  <Play aria-hidden="true" />
                  ابدأ المباراة
                </Button>
              ) : null}
              <p>تبدأ المباراة تلقائياً بعد اكتمال المقاعد الأربعة واستعداد الجميع.</p>
            </div>
          ) : null}

          {room.phase === 'BIDDING' ? (
            <div className={styles.actionPanel} aria-label="خيارات الشراء">
              <div className={styles.biddingGrid}>
                {room.availableBids.length === 0 ? (
                  <p className={styles.biddingHint}>
                    {room.bidder === room.yourSeat
                      ? 'لا يوجد خيار متاح في هذه المرحلة.'
                      : 'بانتظار دورك في المزايدة.'}
                  </p>
                ) : null}
                {room.availableBids.map((bid) => {
                  const isYourBid = room.bidder === room.yourSeat;
                  const disabled = busy || !isYourBid;
                  if (bid.mode === 'pass') {
                    return (
                      <Button
                        key="pass"
                        variant="ghost"
                        className={styles.passButton}
                        disabled={disabled}
                        onClick={() =>
                          emit('baloot:bid', {
                            bid,
                            expectedVersion: room.stateVersion,
                            commandId: commandId('pass'),
                          })
                        }
                      >
                        بس (تمرير)
                      </Button>
                    );
                  }
                  if (bid.mode === 'sun') {
                    return (
                      <Button
                        key="sun"
                        variant="gold"
                        className={styles.sunButton}
                        disabled={disabled}
                        onClick={() =>
                          emit('baloot:bid', {
                            bid,
                            expectedVersion: room.stateVersion,
                            commandId: commandId('sun'),
                          })
                        }
                      >
                        <Sun aria-hidden="true" />
                        صن
                      </Button>
                    );
                  }
                  if (bid.mode === 'ashkal') {
                    return (
                      <Button
                        key="ashkal"
                        variant="outline"
                        className={styles.ashkalButton}
                        disabled={disabled}
                        onClick={() =>
                          emit('baloot:bid', {
                            bid,
                            expectedVersion: room.stateVersion,
                            commandId: commandId('ashkal'),
                          })
                        }
                      >
                        <Sparkles aria-hidden="true" />
                        أشكل (تحدّي الشريك)
                      </Button>
                    );
                  }
                  if (bid.mode === 'hokum') {
                    const { label, name, Icon } = TAHADDI_SUIT[bid.trump];
                    return (
                      <Button
                        key={`hokum-${bid.trump}`}
                        variant="outline"
                        className={styles.hokumButton}
                        disabled={disabled}
                        onClick={() =>
                          emit('baloot:bid', {
                            bid,
                            expectedVersion: room.stateVersion,
                            commandId: commandId(`hokum-${bid.trump}`),
                          })
                        }
                      >
                        <Icon aria-hidden="true" />
                        حكم {name} ({label})
                      </Button>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          ) : null}

          {room.phase === 'DOUBLING' ? (
            <div className={styles.actionPanel} aria-label="خيارات الدبل">
              <div className={styles.doublingGrid}>
                <div className={styles.doublingState}>
                  <span>حالة العقد</span>
                  <strong>
                    {room.contract?.mode.mode === 'sun'
                      ? 'صن'
                      : `حكم ${room.contract ? TAHADDI_SUIT[room.contract.mode.trump].name : ''}`}
                  </strong>
                  <em>
                    المضاعف: ×{formatNumber(room.contract?.multiplier ?? 1)}
                    {room.contract ? ` (${multiplierLabel(room.contract.multiplier)})` : ''}
                  </em>
                </div>
                {room.availableBids.length === 0 ? (
                  <p className={styles.biddingHint}>
                    {room.bidder === room.yourSeat
                      ? 'بانتظار قرار الفريق الخصم.'
                      : 'بانتظار دور الخصم في الدبل.'}
                  </p>
                ) : null}
                {room.availableBids.map((bid) => {
                  if (
                    bid.mode !== 'accept' &&
                    bid.mode !== 'double' &&
                    bid.mode !== 'triple' &&
                    bid.mode !== 'quadruple' &&
                    bid.mode !== 'gahwa'
                  ) {
                    return null;
                  }
                  const isYourBid = room.bidder === room.yourSeat;
                  const label = balootBidLabel(bid);
                  return (
                    <Button
                      key={`${bid.mode}-${'play' in bid ? bid.play : 'decision'}`}
                      variant="gold"
                      className={styles.doublingButton}
                      disabled={busy || !isYourBid}
                      onClick={() =>
                        emit('baloot:bid', {
                          bid,
                          expectedVersion: room.stateVersion,
                          commandId: commandId(
                            `${bid.mode}-${'play' in bid ? bid.play : 'decision'}`,
                          ),
                        })
                      }
                    >
                      <Zap aria-hidden="true" />
                      {label}
                    </Button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {room.yourHand.length > 0 &&
          (room.phase === 'BIDDING' ||
            room.phase === 'PLAYING' ||
            room.phase === 'TRICK_RESULT') ? (
            <section className={styles.handPanel} aria-label="يدك">
              <header>
                <div>
                  <span>أوراق يدك</span>
                  <strong>
                    {room.phase === 'BIDDING'
                      ? room.bidder === room.yourSeat
                        ? 'راجع ورقك ثم اختر الشراء'
                        : 'راجع ورقك بانتظار الشراء'
                      : isYourTurn
                        ? 'اختر ورقة قانونية للرمي'
                        : 'بانتظار دورك'}
                  </strong>
                </div>
                {handWarning ? (
                  <span className={styles.handWarning} role="alert" aria-live="polite">
                    {handWarning}
                  </span>
                ) : null}
              </header>
              <div
                className={styles.hand}
                role="list"
                dir="ltr"
                style={{ '--hand-count': room.yourHand.length } as React.CSSProperties}
              >
                {sortHandForDisplay(room.yourHand, room.contract?.mode ?? null).map(
                  (card, index) => {
                    const count = room.yourHand.length;
                    const fan = handFanDegrees(index, count);
                    const playable =
                      room.phase === 'PLAYING' && isYourTurn && !busy && room.contract
                        ? getLegalPlays(
                            room.yourHand,
                            room.currentTrick.map((play) => play.card),
                            room.contract.mode as Contract,
                          ).some((legal) => legal.suit === card.suit && legal.rank === card.rank)
                        : false;
                    return (
                      <div
                        key={card.id}
                        role="listitem"
                        className={`${styles.handSlot} ${playable ? styles.handSlotPlayable : ''}`}
                        style={{ '--hand-fan': `${fan.toFixed(2)}deg` } as React.CSSProperties}
                      >
                        <PlayingCard
                          card={card}
                          enabled={playable}
                          onPlay={() => {
                            if (!playable) {
                              setHandWarning(
                                'لا يمكن لعب هذه الورقة الآن. اتبع اللون أو اضرب بالحكم.',
                              );
                              window.setTimeout(() => setHandWarning(''), 2500);
                              return;
                            }
                            emit('baloot:play-card', {
                              card: { suit: card.suit, rank: card.rank },
                              expectedVersion: room.stateVersion,
                              commandId: commandId(`card-${card.id}`),
                            });
                          }}
                        />
                      </div>
                    );
                  },
                )}
              </div>
            </section>
          ) : null}

          {room.phase === 'ROUND_RESULT' ? (
            <div className={styles.actionPanel}>
              <strong>اكتملت الصكة</strong>
              {self.isHost ? (
                <Button
                  variant="gold"
                  disabled={busy}
                  onClick={() => emit('baloot:next-round', {})}
                >
                  <Play aria-hidden="true" />
                  ابدأ الصكة التالية
                </Button>
              ) : (
                <p>بانتظار المضيف لبدء الصكة التالية.</p>
              )}
            </div>
          ) : null}

          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
        </section>

        <aside className={styles.scoreboard} aria-label="لوحة المباراة">
          <div className={styles.scoreHeader}>
            <div>
              <span>العقد الحالي</span>
              <strong>{contractLabel}</strong>
            </div>
            <div className={styles.targetScore}>
              <span>الهدف</span>
              <strong>{formatNumber(BALOOT_RULES.matchTarget)} بنطًا</strong>
            </div>
          </div>
          <div className={styles.scoreGrid}>
            <div className={styles.scoreTile} data-tone={room.yourTeam === 'A' ? 'us' : 'them'}>
              <div className={styles.scoreTileHeader}>
                <span>{room.yourTeam === 'A' ? 'لنا' : 'لهم'} (فريق A)</span>
                <small>
                  {room.scores[0] >= BALOOT_RULES.matchTarget
                    ? '🏆 فائز'
                    : `${formatNumber(Math.max(0, BALOOT_RULES.matchTarget - room.scores[0]))} بنط متبقٍ`}
                </small>
              </div>
              <strong>{formatNumber(room.scores[0])}</strong>
              <div className={styles.scoreProgress}>
                <span
                  style={{
                    width: `${Math.min(100, (room.scores[0] / BALOOT_RULES.matchTarget) * 100)}%`,
                  }}
                />
              </div>
            </div>
            <div className={styles.scoreTile} data-tone={room.yourTeam === 'B' ? 'us' : 'them'}>
              <div className={styles.scoreTileHeader}>
                <span>{room.yourTeam === 'B' ? 'لنا' : 'لهم'} (فريق B)</span>
                <small>
                  {room.scores[1] >= BALOOT_RULES.matchTarget
                    ? '🏆 فائز'
                    : `${formatNumber(Math.max(0, BALOOT_RULES.matchTarget - room.scores[1]))} بنط متبقٍ`}
                </small>
              </div>
              <strong>{formatNumber(room.scores[1])}</strong>
              <div className={styles.scoreProgress}>
                <span
                  style={{
                    width: `${Math.min(100, (room.scores[1] / BALOOT_RULES.matchTarget) * 100)}%`,
                  }}
                />
              </div>
            </div>
          </div>
          {room.roundScore ? (
            <section className={styles.scoreBreakdown} aria-label="تفصيل نقاط الصكة الأخيرة">
              <span className={styles.historyTitle}>مصدر نقاط الصكة الأخيرة</span>
              <div>
                {(['A', 'B'] as const).map((team, index) => {
                  const score = room.roundScore!.teams[index];
                  return (
                    <dl key={team}>
                      <div>
                        <dt>الفريق</dt>
                        <dd>
                          {team === room.yourTeam ? 'لنا' : 'لهم'} ({team})
                        </dd>
                      </div>
                      <div>
                        <dt>الورق</dt>
                        <dd>{formatNumber(score.cardPoints)}</dd>
                      </div>
                      <div>
                        <dt>المشاريع</dt>
                        <dd>{formatNumber(score.projectPoints)}</dd>
                      </div>
                      <div>
                        <dt>بلوت</dt>
                        <dd>{formatNumber(score.balootPoints)}</dd>
                      </div>
                      <div>
                        <dt>آخر أكلة</dt>
                        <dd>{formatNumber(score.lastTrickPoints)}</dd>
                      </div>
                      <div>
                        <dt>المطبّق</dt>
                        <dd>{formatNumber(room.roundScore!.applied[index])}</dd>
                      </div>
                    </dl>
                  );
                })}
              </div>
            </section>
          ) : null}
          <div className={styles.historySection}>
            <span className={styles.historyTitle}>
              سجل الأكلات ({formatNumber(room.trickHistory.length)}/{formatNumber(8)})
            </span>
            <ol className={styles.history} aria-label="سجل الأكلات">
              {room.trickHistory.length === 0 ? (
                <li className={styles.emptyHistory}>لم تكتمل أكلة بعد في هذه الصكة.</li>
              ) : (
                room.trickHistory.map((trick, index) => (
                  <li key={index}>
                    <span>أكلة {formatNumber(index + 1)}</span>
                    <strong>فريق {trick.winnerTeam === room.yourTeam ? 'لنا' : 'لهم'}</strong>
                    <small>المقعد {formatNumber(trick.winnerSeat + 1)}</small>
                  </li>
                ))
              )}
            </ol>
          </div>
          {room.autoPlayEvents.length > 0 ? (
            <div className={styles.historySection}>
              <span className={styles.historyTitle}>اللعب التلقائي عند انتهاء المهلة</span>
              <ol className={styles.history} aria-label="سجل اللعب التلقائي">
                {room.autoPlayEvents.map((event, index) => (
                  <li key={`${event.trickNumber}-${event.seat}-${index}`}>
                    <span>أكلة {formatNumber(event.trickNumber)}</span>
                    <strong>المقعد {formatNumber(event.seat + 1)}</strong>
                    <small>
                      {event.card.rank} {suitName(event.card.suit)}
                    </small>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          <p className={styles.honestyNote}>
            الخادم يخلط ويوزع ويتحقق من الدور وقانونية الورقة. لا تُرسل أوراق خصومك إلى جهازك.
          </p>
          <Button variant="ghost" onClick={leave}>
            <LogOut aria-hidden="true" />
            مغادرة المجلس
          </Button>
        </aside>
      </Card>
    </>
  );
}

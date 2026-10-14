'use client';
import Link from 'next/link';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Check,
  Copy,
  Crown,
  Eye,
  Flag,
  Maximize,
  Play,
  Radio,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import type { FastestButtonSettings, FastestButtonSnapshot } from '@tahaddi/contracts';
import { Button, ButtonLink, Input } from '@/components/ui';
import { useFastestButton, type FastestRole } from './use-fastest-button';
import styles from './fastest-button.module.css';
const MODES = {
  classic: { title: 'السرعة الكلاسيكية', label: 'أول ضغطة، فائز واحد', icon: Zap },
  elimination: { title: 'الإقصاء', label: 'ابقَ في السباق حتى النهاية', icon: ShieldCheck },
  points: { title: 'النقاط', label: 'كل جولة تغيّر الترتيب', icon: Trophy },
} as const;
const DEFAULT_SETTINGS: FastestButtonSettings = {
  mode: 'classic',
  totalRounds: 5,
  responseSeconds: 10,
  countdownSeconds: 3,
};
function GoldenCup() {
  const id = useId();
  return (
    <svg className={styles.cup} viewBox="0 0 240 260" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="var(--fb-gold-shade)" />
          <stop offset=".35" stopColor="var(--fb-gold)" />
          <stop offset=".55" stopColor="var(--fb-gold-light)" />
          <stop offset="1" stopColor="var(--fb-gold-shade)" />
        </linearGradient>
      </defs>
      <g fill={`url(#${id})`} stroke="var(--fb-gold)" strokeWidth="3">
        <path d="M63 46H28v31c0 44 23 65 51 67v-17c-24-3-33-22-33-48V64h17zm114 0h35v31c0 44-23 65-51 67v-17c24-3 33-22 33-48V64h-17z" />
        <path d="M60 29h120v53c0 47-25 77-60 77S60 129 60 82z" />
        <path d="M108 155h24v39h-24zm-26 40h76l13 20H69z" />
        <rect x="59" y="217" width="122" height="20" rx="5" />
      </g>
      <path
        d="m120 58 10 21 23 3-17 16 4 23-20-11-20 11 4-23-17-16 23-3z"
        fill="var(--fb-background)"
        opacity=".75"
      />
      <path
        d="M78 43v36c0 25 7 45 18 55"
        fill="none"
        stroke="var(--fb-gold-light)"
        strokeWidth="6"
        opacity=".7"
        strokeLinecap="round"
      />
    </svg>
  );
}
function SettingsForm({
  value,
  onSave,
  pending,
  connected,
  creating = false,
}: {
  value: FastestButtonSettings;
  onSave: (settings: FastestButtonSettings) => void;
  pending: boolean;
  connected: boolean;
  creating?: boolean;
}) {
  const [settings, setSettings] = useState(value);
  return (
    <form
      className={styles.settings}
      onSubmit={(e) => {
        e.preventDefault();
        onSave(settings);
      }}
    >
      <fieldset>
        <legend>نمط المنافسة</legend>
        <div className={styles.modeOptions}>
          {Object.entries(MODES).map(([mode, info]) => (
            <label key={mode} data-selected={settings.mode === mode}>
              <input
                type="radio"
                name="fastest-mode"
                value={mode}
                checked={settings.mode === mode}
                onChange={() =>
                  setSettings({ ...settings, mode: mode as FastestButtonSettings['mode'] })
                }
              />
              <info.icon aria-hidden="true" />
              <span>
                <b>{info.title}</b>
                <small>{info.label}</small>
              </span>
              <span className={styles.radioMark} aria-hidden="true">
                {settings.mode === mode && <Check />}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className={styles.settingNumbers}>
        {settings.mode === 'points' && (
          <Input
            label="عدد الجولات"
            type="number"
            min={1}
            max={30}
            value={settings.totalRounds}
            onChange={(e) => setSettings({ ...settings, totalRounds: Number(e.target.value) })}
            required
          />
        )}
        <Input
          label="مهلة الضغط (ثوانٍ)"
          type="number"
          min={3}
          max={60}
          value={settings.responseSeconds}
          onChange={(e) => setSettings({ ...settings, responseSeconds: Number(e.target.value) })}
          required
        />
        <Input
          label="الاستعداد (ثوانٍ)"
          type="number"
          min={2}
          max={10}
          value={settings.countdownSeconds}
          onChange={(e) => setSettings({ ...settings, countdownSeconds: Number(e.target.value) })}
          required
        />
      </div>
      <Button fullWidth loading={pending} disabled={!connected} type="submit">
        {creating ? 'أنشئ غرفة المنافسة' : 'احفظ الإعدادات'}
        <ArrowRight aria-hidden="true" />
      </Button>
    </form>
  );
}
export function FastestLeaderboard({
  room,
  playerId,
}: {
  room: FastestButtonSnapshot;
  playerId?: string;
}) {
  const players = room.players
    .filter((p) => !p.removed)
    .toSorted((a, b) =>
      room.settings.mode === 'points'
        ? b.score - a.score || a.name.localeCompare(b.name, 'ar')
        : Number(a.eliminated) - Number(b.eliminated) ||
          (room.round?.presses.find((p) => p.playerId === a.id)?.sequence ?? Infinity) -
            (room.round?.presses.find((p) => p.playerId === b.id)?.sequence ?? Infinity) ||
          a.name.localeCompare(b.name, 'ar'),
    );
  const results = room.round?.awards ?? [];
  return (
    <section className={styles.leaderboard} aria-label="لوحة ترتيب اللاعبين">
      <div className={styles.panelHead}>
        <span>
          <Trophy aria-hidden="true" />{' '}
          {room.settings.mode === 'points'
            ? 'الترتيب المباشر'
            : room.round
              ? 'ترتيب ضغطات الجولة'
              : 'المشاركون'}
        </span>
        <b>{players.length}</b>
      </div>
      {!players.length ? (
        <p className={styles.empty}>أرسل رمز الغرفة لأصدقائك؛ ستظهر أسماؤهم هنا فور الانضمام.</p>
      ) : (
        <ol>
          {players.map((player) => (
            <li
              key={player.id}
              data-self={player.id === playerId}
              data-eliminated={player.eliminated}
            >
              <span className={styles.rank}>
                {room.settings.mode === 'points'
                  ? players.filter((p) => p.score > player.score).length + 1
                  : (room.round?.presses.find((p) => p.playerId === player.id)?.sequence ?? '—')}
              </span>
              <span className={styles.avatar}>{player.name.slice(0, 1)}</span>
              <span className={styles.playerName}>
                <b>
                  {player.name}
                  {player.id === playerId && <small> أنت</small>}
                </b>
                <small>
                  {player.eliminated
                    ? 'مقصى · يمكنك متابعة البطولة'
                    : player.connected
                      ? 'متصل'
                      : 'غير متصل'}
                  {results.find((a) => a.playerId === player.id)?.points
                    ? ` · +${results.find((a) => a.playerId === player.id)!.points} في الجولة`
                    : ''}
                </small>
              </span>
              <strong>
                {room.settings.mode === 'points' ? (
                  player.score
                ) : player.eliminated ? (
                  <X aria-label="مقصى" />
                ) : (
                  <Check aria-label="متأهل" />
                )}
              </strong>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
function Rules({ mode }: { mode: FastestButtonSettings['mode'] }) {
  return (
    <details className={styles.rules}>
      <summary>
        <ShieldCheck aria-hidden="true" /> قواعد المنافسة والعدالة
      </summary>
      <ul>
        <li>
          النتيجة من الخادم وحده. لا تُقبل ضغطة قبل البداية، ولا أكثر من ضغطة لكل لاعب في الجولة.
        </li>
        <li>
          الترتيب هو ترتيب تسجيل الضغطات الصالحة ذريًا في الخادم، حتى إذا تساوت أجزاء الثانية. تأخير
          الشبكة قد يؤثر؛ هذه ليست قياسًا مطلقًا لسرعة الإنسان.
        </li>
        {mode === 'elimination' && (
          <>
            <li>
              إذا استجاب الجميع يُقصى آخر ضاغط. إذا انتهت المهلة، يُقصى كل من لم يضغط. إذا لم يستجب
              أحد، تُعاد الجولة دون إقصاء.
            </li>
            <li>
              المنقطع يبقى ضمن منافسي الجولة؛ يستطيع العودة والضغط قبل المهلة. بعد المهلة تطبق قاعدة
              عدم الاستجابة. لاعبان متبقيان يعنيان النهائي.
            </li>
          </>
        )}
        {mode === 'points' && (
          <>
            <li>
              الأول 10، الثاني 7، الثالث 5، وبقية الضاغطين نقطة واحدة. عدم الاستجابة صفر. التعادل في
              المجموع يُحسم بجولة فاصلة للمتصدرين فقط؛ أول ضغطة تحسمها دون تغيير مجموع النقاط.
            </li>
            <li>
              إذا لم يستجب أحد في الفاصلة تُعاد بين المتعادلين. لا تعويض عن ضغطات لم تصل أثناء
              الانقطاع.
            </li>
          </>
        )}
        <li>
          إيقاف المضيف يلغي الجولة دون نقاط أو إقصاء. نتائج الغرفة محفوظة على الخادم لمدة 7 أيام منذ
          آخر نشاط؛ إعادة الضبط تبدأ منافسة جديدة داخل الغرفة.
        </li>
      </ul>
    </details>
  );
}
export function FastestButtonRoom({
  role,
  initialCode,
  hostToken,
  hostId,
  hostName,
}: {
  role: FastestRole;
  initialCode?: string;
  hostToken?: string;
  hostId?: string;
  hostName?: string;
}) {
  const game = useFastestButton(role, initialCode, hostToken, hostId);
  const { room, identity, connected, error, pending } = game;
  const [code, setCode] = useState(initialCode ?? '');
  const [name, setName] = useState('');
  const [now, setNow] = useState(0);
  const [sound, setSound] = useState(false);
  const [effects, setEffects] = useState(true);
  const [copied, setCopied] = useState(false);
  const [tap, setTap] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const lastCelebration = useRef('');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clockPhase = room?.phase;
  useEffect(() => {
    if (clockPhase !== 'active' && clockPhase !== 'countdown') return;
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [clockPhase]);
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      void audio.current?.close().catch(() => undefined);
    },
    [],
  );
  const winnerId = room?.championId ?? room?.round?.winnerId;
  const winner = room?.players.find((p) => p.id === winnerId);
  const resultVisible =
    room && ['results', 'finished'].includes(room.phase) && !room.round?.cancelled;
  const celebration =
    resultVisible && winner ? `${room?.code}:${room?.round?.id}:${winner.id}` : '';
  useEffect(() => {
    if (!celebration || lastCelebration.current === celebration) return;
    lastCelebration.current = celebration;
    if (!sound || !audio.current || audio.current.state !== 'running') return;
    const context = audio.current;
    [523, 659, 784].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + index * 0.09;
      oscillator.type = 'triangle';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.32);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    });
  }, [celebration, sound]);
  const serverNow = now ? now + game.clockOffset : (room?.serverNow ?? 0);
  const remaining = room?.round
    ? Math.max(
        0,
        Math.ceil(
          ((room.phase === 'countdown' ? room.round.startAt : room.round.endAt) - serverNow) / 1000,
        ),
      )
    : 0;
  const me = room?.players.find((p) => p.id === identity?.playerId);
  const myPress = room?.round?.presses.find((p) => p.playerId === me?.id);
  const eligible = Boolean(
    me && !me.eliminated && !me.removed && room?.round?.eligibleIds.includes(me.id),
  );
  const active = room?.phase === 'active';
  const canPress = Boolean(connected && active && eligible && !myPress && !pending);
  const status = !room
    ? 'جاهز للمنافسة؟'
    : room.phase === 'lobby'
      ? 'المنافسة تبدأ بكم'
      : room.phase === 'countdown'
        ? 'استعدّ… انتظر الإشارة'
        : active
          ? myPress
            ? 'سُجلت ضغطتك · انتظر النتيجة'
            : 'اضغط الآن!'
          : room.phase === 'finished'
            ? 'بطل المنافسة'
            : room.round?.cancelled
              ? 'الجولة ملغاة'
              : winner
                ? 'لدينا فائز!'
                : 'انتهت مهلة الجولة';
  function toggleSound() {
    const next = !sound;
    setSound(next);
    if (next && typeof AudioContext !== 'undefined') {
      audio.current ??= new AudioContext();
      void audio.current.resume().catch(() => game.setError('لم يسمح المتصفح بتشغيل الصوت.'));
    }
  }
  function press() {
    setTap(true);
    timers.current.push(setTimeout(() => setTap(false), 350));
    game.press();
  }
  async function copyCode() {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      timers.current.push(setTimeout(() => setCopied(false), 1800));
    } catch {
      game.setError('تعذّر النسخ. يمكنك تحديد رمز الغرفة ونسخه يدويًا.');
    }
  }
  function join(event: FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) return game.setError('اكتب رمز الغرفة المكوّن من 6 أرقام.');
    if (name.trim().length < 2) return game.setError('اكتب اسمًا من حرفين على الأقل.');
    game.join(code, name);
  }
  const display = role === 'display';
  return (
    <main
      className={`${styles.room} ${display ? styles.display : ''}`}
      data-role={role}
      data-phase={room?.phase ?? 'join'}
      data-effects={effects}
    >
      <header className={styles.header}>
        <Link href="/games/fastest-button" className={styles.brand}>
          <span className={styles.brandIcon}>
            <Zap aria-hidden="true" />
          </span>
          <span>
            <b>أسرع كبسة زر</b>
            <small>FASTEST BUTTON · تحدي</small>
          </span>
        </Link>
        <div className={styles.headerTools}>
          <span className={styles.connection} data-connected={connected}>
            {connected ? <Wifi aria-hidden="true" /> : <WifiOff aria-hidden="true" />}
            {connected ? 'متصل بالخادم' : 'جارٍ الاتصال'}
          </span>
          {room && (
            <span className={styles.headerCode} dir="ltr">
              {room.code}
            </span>
          )}
          {!display && (
            <Link href="/games" className={styles.back}>
              <ArrowRight aria-hidden="true" /> الألعاب
            </Link>
          )}
        </div>
      </header>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.preferences}>
        {role === 'player' && room && (
          <button type="button" onClick={game.leave}>
            <ArrowRight aria-hidden="true" /> تغيير الغرفة
          </button>
        )}
        <button type="button" onClick={toggleSound} aria-pressed={sound}>
          {sound ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
          {sound ? 'الصوت مفعّل' : 'تفعيل الصوت'}
        </button>
        <button type="button" onClick={() => setEffects(!effects)} aria-pressed={effects}>
          <Crown aria-hidden="true" />
          {effects ? 'إيقاف المؤثرات' : 'تفعيل المؤثرات'}
        </button>
        {display && (
          <button
            type="button"
            onClick={() => {
              void document.documentElement
                .requestFullscreen?.()
                .catch(() => game.setError('ملء الشاشة غير متاح في هذا المتصفح.'));
            }}
          >
            <Maximize aria-hidden="true" /> ملء الشاشة
          </button>
        )}
      </div>
      {!room ? (
        <section className={styles.entry}>
          <div className={styles.entryArt}>
            <span className={styles.eyebrow}>
              <Radio aria-hidden="true" /> منافسة مباشرة من أول إشارة
            </span>
            <h1>
              لحظة واحدة.
              <br />
              <em>كبسة تحسمها.</em>
            </h1>
            <p>
              غرفة واحدة تجمعكم، وثلاث طرق للمنافسة.
              <br />
              استعدّ للإشارة؛ الخادم يسجّل السباق.
            </p>
            <div className={styles.previewBuzzer} aria-hidden="true">
              <span>
                <Zap />
              </span>
            </div>
            <div className={styles.entryModes}>
              {Object.values(MODES).map((info) => (
                <span key={info.title}>
                  <info.icon aria-hidden="true" />
                  {info.title}
                </span>
              ))}
            </div>
          </div>
          <section
            className={styles.entryPanel}
            aria-label={
              role === 'host' ? 'إنشاء غرفة' : display ? 'الاتصال بشاشة البث' : 'الانضمام إلى غرفة'
            }
          >
            <span className={styles.eyebrow}>
              {role === 'host'
                ? 'مركز قيادة المنافسة'
                : display
                  ? 'شاشة الجمهور'
                  : 'خذ مكانك في السباق'}
            </span>
            <h2>
              {role === 'host'
                ? `أهلًا، ${hostName ?? 'المضيف'}`
                : display
                  ? 'نبحث عن الغرفة…'
                  : 'انضم إلى المنافسة'}
            </h2>
            {role === 'host' ? (
              <SettingsForm
                value={DEFAULT_SETTINGS}
                connected={connected}
                pending={pending}
                creating
                onSave={game.create}
              />
            ) : display ? (
              <p>
                الغرفة <b dir="ltr">{initialCode}</b>. انتظر اتصال الخادم. شاشة البث للقراءة فقط.
              </p>
            ) : (
              <>
                <form className={styles.joinForm} onSubmit={join} noValidate>
                  <Input
                    label="اسم اللاعب"
                    name="playerName"
                    autoComplete="nickname"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={30}
                    placeholder="الاسم الذي سيظهر للجميع"
                  />
                  <Input
                    label="رمز الغرفة"
                    name="roomCode"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    dir="ltr"
                    value={code}
                    onChange={(e) =>
                      setCode(
                        e.target.value
                          .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632))
                          .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776))
                          .replace(/[^0-9]/g, '')
                          .slice(0, 6),
                      )
                    }
                    maxLength={6}
                    placeholder="000000"
                  />
                  <Button fullWidth type="submit" loading={pending} disabled={!connected}>
                    انضم للسباق <ArrowRight aria-hidden="true" />
                  </Button>
                </form>
                <div className={styles.hostInvite}>
                  <span>تجمع الأصدقاء؟</span>
                  <ButtonLink href="/games/fastest-button/host" variant="outline">
                    ابدأ كمضيف <Flag aria-hidden="true" />
                  </ButtonLink>
                </div>
              </>
            )}
            <p className={styles.fairness}>
              <ShieldCheck aria-hidden="true" /> الترتيب يعتمد وصول الضغطات للخادم، وقد يتأثر بتأخير
              الشبكة.
            </p>
          </section>
        </section>
      ) : (
        <>
          <div className={styles.matchMeta}>
            <span className={styles.eyebrow}>
              {MODES[room.settings.mode].title}
              {room.round?.isTiebreak ? ' · جولة فاصلة' : room.round?.isFinal ? ' · النهائي' : ''}
            </span>
            <span>
              <Users aria-hidden="true" />
              {room.players.filter((p) => p.connected && !p.removed).length} متصل{' '}
              <b> / {room.players.filter((p) => !p.removed).length} مشارك</b>
            </span>
            <span>
              الجولة {room.round?.number ?? 0}
              {room.settings.mode === 'points'
                ? ` · ${room.regularCompleted} / ${room.settings.totalRounds} مكتملة`
                : ''}
            </span>
          </div>
          <div className={styles.arenaLayout}>
            <section className={styles.stage} aria-label="ساحة المنافسة">
              <div className={styles.stageLines} aria-hidden="true" />
              <span className={styles.stageLabel}>
                {display ? 'LIVE STAGE' : role === 'host' ? 'HOST CONTROL' : 'YOUR MOMENT'}
              </span>
              <h1 className={styles.status} aria-live="polite">
                {status}
              </h1>
              {resultVisible && winner ? (
                <section className={styles.ceremony} aria-label="إعلان الفائز">
                  <div className={styles.spotlight} aria-hidden="true" />
                  <GoldenCup />
                  {effects && (
                    <div className={styles.particles} aria-hidden="true">
                      {Array.from({ length: 14 }, (_, i) => (
                        <i key={i} style={{ '--particle-index': i } as React.CSSProperties} />
                      ))}
                    </div>
                  )}
                  <span className={styles.winnerLabel}>
                    {room.championId ? 'بطل المنافسة' : 'فائز الجولة'}
                  </span>
                  <strong
                    className={styles.winnerName}
                    style={{ '--winner-length': winner.name.length } as React.CSSProperties}
                  >
                    {winner.name}
                  </strong>
                  <p>أسرع شخص ضغط الزر!</p>
                  {room.settings.mode === 'points' && (
                    <span className={styles.winnerScore}>{winner.score} نقطة</span>
                  )}
                </section>
              ) : room.phase === 'countdown' ? (
                <div className={styles.countdown} aria-label={`الاستعداد: ${remaining}`}>
                  <span>{remaining || '…'}</span>
                  <p>لا تضغط قبل إشارة البداية</p>
                  <div className={styles.readyLights} aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
              ) : role === 'player' && active ? (
                <div className={styles.playerStage}>
                  <button
                    type="button"
                    className={styles.buzzer}
                    data-tap={tap}
                    data-recorded={Boolean(myPress)}
                    disabled={!canPress}
                    onPointerDown={(event) => {
                      if (event.isPrimary && event.button === 0 && canPress) press();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === ' ' || event.key === 'Enter') {
                        event.preventDefault();
                        if (!event.repeat && canPress) press();
                      }
                    }}
                    onClick={(event) => {
                      if (event.detail === 0 && canPress) press();
                    }}
                    aria-label="اضغط زر المنافسة"
                  >
                    <span>
                      {myPress ? <Check aria-hidden="true" /> : <Zap aria-hidden="true" />}
                      <b>
                        {myPress
                          ? 'تمت الكبسة'
                          : pending
                            ? 'ننتظر التأكيد'
                            : eligible
                              ? 'اكبس!'
                              : 'شاهد السباق'}
                      </b>
                    </span>
                  </button>
                  <p className={styles.tapStatus} role="status">
                    {myPress
                      ? `سُجلت ضغطتك في المركز ${myPress.sequence}. انتظر نتيجة الخادم.`
                      : pending
                        ? 'بانتظار تأكيد الخادم…'
                        : !eligible
                          ? 'أنت غير مشارك في هذه الجولة؛ تابع النتائج.'
                          : 'كبسة واحدة. قرار واحد. الآن وقتك.'}
                  </p>
                  <span className={styles.timer}>{remaining} ثانية متبقية</span>
                </div>
              ) : (
                <div className={styles.waitingStage}>
                  {active ? (
                    <>
                      <div className={styles.liveSignal}>
                        <Zap aria-hidden="true" />
                      </div>
                      <strong>{remaining}</strong>
                      <p>
                        {room.round?.presses.length ?? 0} / {room.round?.eligibleIds.length ?? 0}{' '}
                        ضغطات مسجلة
                      </p>
                    </>
                  ) : (
                    <>
                      <div className={styles.waitingMark}>
                        <Zap aria-hidden="true" />
                      </div>
                      <p>
                        {room.phase === 'results'
                          ? 'جولة جديدة، وفرصة جديدة.'
                          : 'تظهر إشارة الاستعداد عندما يبدأ المضيف.'}
                      </p>
                      {role === 'player' && (
                        <span>
                          {me?.eliminated
                            ? 'أُقصيت من المنافسة؛ يمكنك مشاهدة بقية الجولات.'
                            : 'مكانك محفوظ. انتظر إشارة المضيف.'}
                        </span>
                      )}
                    </>
                  )}
                </div>
              )}
              {room.notice && (
                <p className={styles.notice} role="status">
                  {room.notice}
                </p>
              )}
              {role === 'player' && me && (
                <div className={styles.personalStats}>
                  <span>
                    نقاطك <b>{me.score}</b>
                  </span>
                  <span>
                    ترتيبك{' '}
                    <b>
                      {room.settings.mode === 'points'
                        ? room.players.filter((p) => p.score > me.score).length + 1
                        : (myPress?.sequence ?? '—')}
                    </b>
                  </span>
                  <span>{me.eliminated ? 'مقصى' : 'مشارك'}</span>
                </div>
              )}
              {role === 'host' && (
                <div className={styles.hostActions}>
                  {['lobby', 'results'].includes(room.phase) && (
                    <Button
                      onClick={() => game.command('start')}
                      loading={pending}
                      disabled={
                        !connected ||
                        room.players.filter((p) => !p.eliminated && !p.removed).length <
                          (room.settings.mode === 'classic' ? 1 : 2)
                      }
                    >
                      <Play aria-hidden="true" />
                      {room.round?.isTiebreak || room.tiebreakIds.length
                        ? 'ابدأ الجولة الفاصلة'
                        : room.phase === 'lobby'
                          ? 'ابدأ الجولة'
                          : 'الجولة التالية'}
                    </Button>
                  )}
                  {['countdown', 'active'].includes(room.phase) && (
                    <Button
                      variant="destructive"
                      disabled={!connected || pending}
                      onClick={() => game.command('stop')}
                    >
                      <Square aria-hidden="true" /> أوقف الجولة
                    </Button>
                  )}
                  {['results', 'finished'].includes(room.phase) && (
                    <Button
                      variant="outline"
                      disabled={!connected || pending}
                      onClick={() => {
                        if (
                          window.confirm(
                            'بدء منافسة جديدة يصفر النقاط ونتائج هذه المنافسة. هل تريد المتابعة؟',
                          )
                        )
                          game.command('reset');
                      }}
                    >
                      <RotateCcw aria-hidden="true" /> منافسة جديدة
                    </Button>
                  )}
                </div>
              )}
            </section>
            <aside className={styles.rail}>
              {role === 'host' && (
                <section className={styles.roomControl}>
                  <div className={styles.panelHead}>
                    <span>
                      <Radio aria-hidden="true" /> رمز الغرفة
                    </span>
                    <button type="button" onClick={copyCode} aria-label="نسخ رمز الغرفة">
                      {copied ? <Check /> : <Copy />}
                    </button>
                  </div>
                  <strong dir="ltr" className={styles.roomCode}>
                    {room.code}
                  </strong>
                  <Link href={`/games/fastest-button/join/${room.code}`}>
                    رابط انضمام اللاعبين <ArrowRight aria-hidden="true" />
                  </Link>
                  <Link
                    href={`/games/fastest-button/display/${room.code}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Eye aria-hidden="true" /> افتح شاشة البث
                  </Link>
                </section>
              )}
              <FastestLeaderboard room={room} playerId={identity?.playerId} />
              {room.settings.mode === 'elimination' && (
                <section className={styles.survivors}>
                  <span>
                    متأهلون <b>{room.players.filter((p) => !p.eliminated && !p.removed).length}</b>
                  </span>
                  <span>
                    مقصيون <b>{room.players.filter((p) => p.eliminated).length}</b>
                  </span>
                </section>
              )}
            </aside>
          </div>
          {role === 'host' && room.phase === 'lobby' && (
            <section className={styles.configuration}>
              <h2>
                <SlidersHorizontal aria-hidden="true" /> إعداد المنافسة
              </h2>
              <SettingsForm
                key={`${room.code}:${room.settings.mode}:${room.settings.totalRounds}:${room.settings.responseSeconds}:${room.settings.countdownSeconds}`}
                value={room.settings}
                onSave={(settings) => game.command('configure', settings)}
                pending={pending}
                connected={connected}
              />
            </section>
          )}
          {role === 'host' &&
            (room.phase === 'lobby' ||
              (room.settings.mode === 'classic' && room.phase === 'results')) && (
              <details className={styles.manage}>
                <summary>إدارة المشاركين</summary>
                {room.players
                  .filter((p) => !p.removed)
                  .map((player) => (
                    <div key={player.id}>
                      <b>{player.name}</b>
                      <button
                        type="button"
                        disabled={!connected || pending}
                        onClick={() => {
                          if (window.confirm(`إزالة ${player.name} من المنافسة؟`))
                            game.command('remove', undefined, player.id);
                        }}
                      >
                        إزالة <X aria-hidden="true" />
                      </button>
                    </div>
                  ))}
              </details>
            )}
          {!display && <Rules mode={room.settings.mode} />}
          {room.rounds.length > 0 && !display && (
            <details className={styles.history}>
              <summary>آخر الجولات · {room.rounds.length}</summary>
              <ol>
                {room.rounds.toReversed().map((round) => (
                  <li key={round.id}>
                    <b>
                      الجولة {round.number}
                      {round.isTiebreak ? ' · فاصلة' : ''}
                    </b>
                    <span>
                      {round.cancelled
                        ? 'ملغاة · لا تُحتسب'
                        : round.winnerId
                          ? (room.players.find((p) => p.id === round.winnerId)?.name ?? 'لاعب سابق')
                          : 'دون ضغطة صالحة'}
                    </span>
                    <span>{round.presses.length} ضغطة صالحة</span>
                  </li>
                ))}
              </ol>
            </details>
          )}
          {display && (
            <footer className={styles.broadcastFooter}>
              <span>أسرع كبسة زر · تحدي</span>
              <span>النتائج مباشرة من الخادم · شاشة للقراءة فقط</span>
            </footer>
          )}
        </>
      )}
    </main>
  );
}

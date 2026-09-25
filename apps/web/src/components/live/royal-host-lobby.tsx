'use client';

import { useState, type RefObject } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  BarChart3,
  Bell,
  BookOpen,
  ChevronDown,
  CircleUserRound,
  Crown,
  Eye,
  Home,
  Medal,
  Play,
  Settings,
  Shield,
  Square,
  Trophy,
  UsersRound,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { BrandMark } from '@/components/brand';
import { RoomCode } from '@/components/quiz';
import { Button } from '@/components/ui';
import { formatNumber } from '@/lib/utils';
import styles from './royal-host-lobby.module.css';

type LobbyPlayer = {
  id: string;
  name: string;
  score: number;
  rank: number;
  streak: number;
};

type LobbyQuestion = {
  questionId: string;
  question: { id: string; prompt: string };
};

const navigation = [
  { href: '/host', label: 'لوحة التحكم', icon: Home, current: true },
  { href: '/quizzes', label: 'المسابقات', icon: Trophy },
  { href: '/questions', label: 'بنك الأسئلة', icon: BookOpen },
  { href: '#royal-host-participants', label: 'المشاركون', icon: UsersRound },
  { href: '/profile', label: 'الملف الشخصي', icon: CircleUserRound },
  { href: '/leaderboard', label: 'لوحة الشرف', icon: BarChart3 },
  { href: '#royal-host-tools', label: 'إعدادات الجولة', icon: Settings },
] as const;

export function RoyalHostLobby({
  sessionId,
  roomCode,
  joinUrl,
  quizTitle,
  connected,
  busy,
  message,
  participantCount,
  players,
  minimumPlayers,
  maxPlayers,
  totalQuestions,
  alerts,
  soundEnabled,
  settingsOpen,
  autoAdvance,
  questions,
  questionId,
  questionsOpen,
  questionToggleRef,
  questionNavigatorRef,
  onStart,
  onFinish,
  onToggleSound,
  onToggleSettings,
  onToggleAutoAdvance,
  onToggleQuestions,
  onCloseQuestions,
}: {
  sessionId: string;
  roomCode: string;
  joinUrl: string;
  quizTitle: string;
  connected: boolean;
  busy: boolean;
  message: string;
  participantCount: number;
  players: LobbyPlayer[];
  minimumPlayers: number;
  maxPlayers?: number;
  totalQuestions: number;
  alerts: string[];
  soundEnabled: boolean;
  settingsOpen: boolean;
  autoAdvance: boolean;
  questions: LobbyQuestion[];
  questionId?: string;
  questionsOpen: boolean;
  questionToggleRef: RefObject<HTMLButtonElement | null>;
  questionNavigatorRef: RefObject<HTMLElement | null>;
  onStart: () => void;
  onFinish: () => void;
  onToggleSound: () => void;
  onToggleSettings: () => void;
  onToggleAutoAdvance: () => void;
  onToggleQuestions: () => void;
  onCloseQuestions: () => void;
}) {
  const [showAllPlayers, setShowAllPlayers] = useState(false);
  const roomPlayers = players;
  const missingPlayers = Math.max(0, minimumPlayers - participantCount);
  const missingPlayersHint =
    missingPlayers === 1
      ? 'ينقص متسابق واحد لبدء الجولة'
      : missingPlayers === 2
        ? 'ينقص متسابقان لبدء الجولة'
        : `ينقص ${formatNumber(missingPlayers)} متسابقين متصلين لبدء الجولة`;
  const canStart = connected && !busy && participantCount >= minimumPlayers && totalQuestions > 0;
  const startHint = !connected
    ? 'تعذر البدء أثناء انقطاع الاتصال؛ ستتاح الجولة بعد استعادة الاتصال'
    : busy
      ? 'انتظر اكتمال الأمر الجاري قبل بدء الجولة'
      : totalQuestions === 0
        ? 'لا يمكن البدء قبل إضافة سؤال واحد على الأقل'
        : participantCount >= minimumPlayers
          ? `يمكن بدء الجولة الآن · ${formatNumber(participantCount)}${maxPlayers ? ` / ${formatNumber(maxPlayers)}` : ''} متسابق`
          : missingPlayersHint;

  return (
    <div
      className={`royal-host-dashboard royal-live ${styles.dashboard}`}
      data-phase="LOBBY"
      role="region"
      aria-label="لوحة المضيف المباشرة"
    >
      <aside className={styles.sidebar} aria-label="القائمة الجانبية للوحة المضيف">
        <Link href="/" className={styles.brand} aria-label="تحدّي — الصفحة الرئيسية">
          <BrandMark title="تحدّي" />
          <strong>تحدّي</strong>
          <small>أكثر من مجرد سؤال</small>
        </Link>

        <nav className={styles.navigation} aria-label="التنقل في لوحة المضيف">
          {navigation.map((item) => (
            <Link
              href={item.href}
              key={item.label}
              aria-label={item.label}
              aria-current={'current' in item && item.current ? 'page' : undefined}
              className={'current' in item && item.current ? styles.currentNav : undefined}
            >
              <item.icon aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <section className={styles.promo} aria-label="شعار تحدّي">
          <span>العلم</span>
          <strong>المعرفة</strong>
          <b>المتعة</b>
          <Image
            src="/home/tahaddi-trophy-ornate-transparent.png"
            alt="كأس تحدّي الملكي"
            width={180}
            height={180}
            sizes="180px"
          />
          <p>«كل سؤال… يقرّبك من القمة»</p>
        </section>
      </aside>

      <header className={styles.topbar} aria-label="شريط حالة الجولة">
        <Link href="/profile" className={styles.welcome} aria-label="فتح الملف الشخصي">
          <span>أهلاً بك</span>
          <strong>المقدم</strong>
          <span className={styles.avatar}>
            <Crown aria-hidden="true" />
          </span>
          <ChevronDown aria-hidden="true" />
        </Link>
        <a
          href="#royal-host-alerts"
          className={styles.notification}
          aria-label="الانتقال إلى تنبيهات النظام"
        >
          <Bell aria-hidden="true" />
        </a>
        <div className={styles.roomStatus} role="status" aria-live="polite" aria-atomic="true">
          <span>حالة الجولة</span>
          <strong>
            {busy
              ? 'جارٍ تنفيذ الأمر'
              : connected
                ? 'بانتظار بدء الأسئلة'
                : 'إعادة الاتصال بالغرفة'}
          </strong>
          <i className={connected ? styles.online : styles.offline} aria-hidden="true" />
        </div>
      </header>

      <section className={styles.main} aria-label="لوبي الجولة">
        <div className={`royal-host-lobby ${styles.lobbySurface}`}>
          <section className={styles.inviteStage} aria-label="دعوة اللاعبين">
            <div className={styles.heroCopy}>
              <span className={styles.heroEyebrow}>غرفة المضيف · جاهزية البث</span>
              <h1>{quizTitle}</h1>
              <p>شارك رمز الغرفة مع اللاعبين، ثم ابدأ السؤال الأول عندما تكتمل الجاهزية.</p>
              <Button
                type="button"
                variant="gold"
                size="lg"
                onClick={onStart}
                disabled={!canStart}
                aria-describedby={!canStart ? 'royal-host-start-hint' : undefined}
                title={!canStart ? startHint : undefined}
              >
                <Play aria-hidden="true" />
                بدء السؤال الأول
              </Button>
              {!canStart && (
                <p className={styles.startHint} id="royal-host-start-hint">
                  {startHint}
                </p>
              )}
              {message && (
                <output className={styles.hostMessage} role="status">
                  {message}
                </output>
              )}
            </div>

            <div className={styles.roomCodePanel}>
              <RoomCode code={roomCode} url={joinUrl} />
              <p>امسح الرمز أو أدخل الكود للانضمام إلى الغرفة</p>
              <span className={connected ? styles.connected : styles.disconnected}>
                {connected ? <Wifi aria-hidden="true" /> : <WifiOff aria-hidden="true" />}
                {connected ? 'الغرفة متصلة' : 'يعاد الاتصال'}
              </span>
            </div>

            <div className={styles.pennant}>
              <Crown aria-hidden="true" />
              <strong>تحدّي</strong>
              <span>{quizTitle}</span>
            </div>
          </section>

          <section className={styles.readiness} aria-labelledby="readiness-title">
            <header className={styles.sectionHeading}>
              <div>
                <UsersRound aria-hidden="true" />
                <div>
                  <h2 id="readiness-title">جاهزية الجولة</h2>
                  <p>راقب المشاركين والأسئلة والاتصال قبل فتح السؤال الأول.</p>
                </div>
              </div>
            </header>
            <dl className={styles.readinessMetrics}>
              <div>
                <dt>المتسابقون</dt>
                <dd>{formatNumber(participantCount)}{maxPlayers ? <small> / {formatNumber(maxPlayers)}</small> : null}</dd>
              </div>
              <div>
                <dt>أسئلة الجولة</dt>
                <dd>{formatNumber(totalQuestions)}</dd>
              </div>
              <div>
                <dt>حالة الاتصال</dt>
                <dd className={connected ? styles.ready : styles.notReady}>
                  {connected ? 'متصل' : 'غير متصل'}
                </dd>
              </div>
            </dl>
            <p className={styles.readinessNote}>
              {canStart
                ? 'يمكنك بدء الجولة الآن. سيظهر السؤال على أجهزة جميع المتسابقين المتصلين.'
                : 'أكمل متطلبات الجاهزية أعلاه، ثم ابدأ الجولة من زر بدء السؤال الأول.'}
            </p>
          </section>
        </div>
      </section>

      <aside className={styles.rightRail} id="royal-host-participants">
        <section
          className={`${styles.panel} ${showAllPlayers ? styles.expandedPanel : ''}`}
          aria-label="المتسابقون في الجولة"
        >
          <header>
            <h2>
              المتسابقون في الجولة <span>({formatNumber(roomPlayers.length)})</span>
            </h2>
            <button
              type="button"
              aria-expanded={showAllPlayers}
              onClick={() => setShowAllPlayers((value) => !value)}
            >
              {showAllPlayers ? 'عرض المختصر' : 'عرض الكل'}
            </button>
          </header>
          {roomPlayers.length ? (
            <ol className={styles.players}>
              {(showAllPlayers ? roomPlayers : roomPlayers.slice(0, 6)).map((player) => (
                <li key={player.id} data-rank={player.rank}>
                  <span>{formatNumber(player.rank)}</span>
                  <i>
                    <CircleUserRound aria-hidden="true" />
                  </i>
                  <strong>{player.name}</strong>
                  <b>{formatNumber(player.score)}</b>
                  {player.rank <= 3 ? <Medal aria-hidden="true" /> : <Shield aria-hidden="true" />}
                </li>
              ))}
            </ol>
          ) : (
            <div className={styles.emptyPlayers}>
              <UsersRound aria-hidden="true" />
              <p>بانتظار أول متسابق</p>
            </div>
          )}
        </section>

        <section className={styles.panel} aria-label="ملخص الغرفة">
          <header>
            <h2>ملخص الغرفة</h2>
          </header>
          <dl className={styles.stats}>
            <div>
              <UsersRound aria-hidden="true" />
              <dt>المشاركون</dt>
              <dd>{formatNumber(participantCount)}</dd>
            </div>
            <div>
              <BookOpen aria-hidden="true" />
              <dt>الأسئلة</dt>
              <dd>{formatNumber(totalQuestions)}</dd>
            </div>
            <div>
              <BarChart3 aria-hidden="true" />
              <dt>السعة</dt>
              <dd>{maxPlayers ? formatNumber(maxPlayers) : 'مفتوحة'}</dd>
            </div>
            <div>
              {connected ? <Wifi aria-hidden="true" /> : <WifiOff aria-hidden="true" />}
              <dt>الاتصال</dt>
              <dd>{connected ? 'مستقر' : 'منقطع'}</dd>
            </div>
          </dl>
        </section>

        <aside className={styles.panel} id="royal-host-alerts" aria-label="تنبيهات النظام">
          <header>
            <h2>
              <Bell aria-hidden="true" /> تنبيهات النظام
            </h2>
          </header>
          <ul className={styles.alerts}>
            {alerts.map((alert) => (
              <li key={alert}>
                <i aria-hidden="true" />
                <span>{alert}</span>
              </li>
            ))}
          </ul>
        </aside>

        <section className={styles.tools} id="royal-host-tools" aria-label="أدوات الجولة">
          <button
            type="button"
            onClick={onToggleSound}
            aria-label={soundEnabled ? 'كتم الصوت' : 'تشغيل الصوت'}
          >
            {soundEnabled ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
          </button>
          <button
            ref={questionToggleRef}
            type="button"
            onClick={onToggleQuestions}
            aria-expanded={questionsOpen}
            aria-controls="royal-host-question-navigator"
          >
            <BookOpen aria-hidden="true" />
            <span>قائمة الأسئلة</span>
          </button>
          <button
            type="button"
            onClick={onToggleSettings}
            aria-expanded={settingsOpen}
            aria-controls="royal-host-display-settings"
          >
            <Settings aria-hidden="true" />
            <span>إعدادات العرض</span>
          </button>
          <Link href={`/display?sessionId=${encodeURIComponent(sessionId)}`}>
            <Eye aria-hidden="true" />
            <span>شاشة العرض</span>
          </Link>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onFinish}
            disabled={busy || !connected}
          >
            <Square aria-hidden="true" /> إنهاء الجولة
          </Button>
          {settingsOpen && (
            <button
              id="royal-host-display-settings"
              type="button"
              className={styles.autoAdvance}
              aria-pressed={autoAdvance}
              onClick={onToggleAutoAdvance}
            >
              الانتقال التلقائي: <strong>{autoAdvance ? 'مفعّل' : 'متوقف'}</strong>
            </button>
          )}
        </section>
      </aside>

      {questionsOpen && (
        <aside
          ref={questionNavigatorRef}
          className={styles.questionNavigator}
          id="royal-host-question-navigator"
          aria-label="قائمة أسئلة الجولة"
          tabIndex={-1}
        >
          <header>
            <h2>قائمة الأسئلة</h2>
            <button type="button" onClick={onCloseQuestions}>
              إغلاق
            </button>
          </header>
          {questions.length ? (
            <ol>
              {questions.map((question, index) => (
                <li key={question.questionId} data-current={question.question.id === questionId}>
                  <span>{formatNumber(index + 1)}</span>
                  <strong>{question.question.prompt}</strong>
                  {question.question.id === questionId && <small>الحالي</small>}
                </li>
              ))}
            </ol>
          ) : (
            <p>ستظهر القائمة بعد اختيار المسابقة.</p>
          )}
        </aside>
      )}
    </div>
  );
}

'use client';
import { formatNumber } from '@/lib/utils';

import { useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  Crown,
  Eye,
  ExternalLink,
  Flame,
  ListChecks,
  ListRestart,
  LogOut,
  Settings,
  SkipForward,
  SlidersHorizontal,
  Square,
  Trophy,
  UserCircle2,
  UsersRound,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui';
import { RoomCode } from '@/components/quiz';
import { LiveFinaleExperience } from './live-finale-experience';
import { LiveQuestionStage } from './live-question-stage';
import { RoyalHostLobby } from './royal-host-lobby';
import { useLiveGame } from './use-live-game';

export type HostQuestion = {
  questionId: string;
  question: {
    id: string;
    prompt: string;
    imageUrl: string | null;
    category: string | null;
    timeLimit: number;
    basePoints: number;
    options: {
      id: string;
      text: string;
      isCorrect: boolean;
    }[];
  };
};

export function LiveHostExperience({
  sessionId,
  hostId,
  accessToken,
  roomCode,
  joinUrl,
  initialAutoAdvance,
  minimumPlayers = 2,
  maxPlayers,
  quizTitle = 'الجولة المباشرة',
  totalQuestions = 0,
  questions = [],
}: {
  sessionId: string;
  hostId: string;
  accessToken: string;
  roomCode: string;
  joinUrl: string;
  initialAutoAdvance: boolean;
  minimumPlayers?: number;
  maxPlayers?: number;
  quizTitle?: string;
  totalQuestions?: number;
  questions?: HostQuestion[];
  initialQuestionPosition?: number;
}) {
  const game = useLiveGame({
    sessionId,
    subjectId: hostId,
    accessToken,
    role: 'host',
  });
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(true);
  const [autoAdvance, setAutoAdvance] = useState(initialAutoAdvance);
  const lastPhase = useRef(game.snapshot?.phase);
  const autoAdvancedQuestion = useRef<string | null>(null);
  const questionToggleRef = useRef<HTMLButtonElement>(null);
  const questionNavigatorRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!soundEnabled || !game.snapshot?.phase || lastPhase.current === game.snapshot.phase) return;
    lastPhase.current = game.snapshot.phase;
    const AudioContextType =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextType) return;
    const context = new AudioContextType();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = game.snapshot.phase === 'REVEAL' ? 660 : 440;
    gain.gain.value = 0.035;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.08);
    oscillator.addEventListener('ended', () => void context.close(), { once: true });
  }, [game.snapshot?.phase, soundEnabled]);

  const snapshot = game.snapshot;
  const phase = snapshot?.phase;
  const commandsDisabled = game.busy || !game.connected;
  const isConnecting = !snapshot;
  const isLobby = phase === 'LOBBY';
  const showInsights = insightsOpen && phase !== 'FINISHED' && phase !== 'LEADERBOARD';
  const questionId = snapshot?.question?.questionId;
  const nextQuestion = game.nextQuestion;
  const participantCount = snapshot?.participantCount ?? 0;
  const answeredCount = game.stats?.answeredCount ?? 0;
  const activeCount = game.stats?.participantCount ?? participantCount;
  const unansweredCount = Math.max(0, activeCount - answeredCount);
  const answerPercentage = activeCount > 0 ? Math.round((answeredCount / activeCount) * 100) : 0;
  const hostQuestion = questions.find((item) => item.question.id === questionId);
  const hostCorrectOptionId = hostQuestion?.question.options.find((option) => option.isCorrect)?.id;
  const currentQuestionNumber = snapshot?.question?.questionNumber ?? null;
  const currentTotalQuestions =
    phase === 'LOBBY' ? totalQuestions : (snapshot?.question?.totalQuestions ?? totalQuestions);
  const phaseLabel =
    phase === 'QUESTION'
      ? 'السؤال مباشر'
      : phase === 'REVEAL'
        ? 'كشف الإجابة'
        : phase === 'LEADERBOARD'
          ? 'عرض الترتيب'
          : phase === 'FINISHED'
            ? 'انتهت المسابقة'
            : phase === 'LOBBY'
              ? 'بانتظار البدء'
              : 'جارٍ الاتصال';
  const rankedPlayers = [...(snapshot?.leaderboard ?? [])].sort(
    (left, right) => left.rank - right.rank,
  );
  const topPlayers = rankedPlayers.slice(0, 3);
  const answerStats =
    snapshot?.question?.options.map((option) => {
      const stats = game.stats?.options.find((item) => item.optionId === option.id);
      return {
        ...option,
        count: stats?.count ?? 0,
        percentage: stats?.percentage ?? 0,
      };
    }) ?? [];
  const hostAlerts = [
    game.connected ? 'الاتصال بالغرفة مستقر' : 'يعاد الاتصال بالغرفة الآن',
    phase === 'QUESTION'
      ? `${formatNumber(unansweredCount)} متسابق لم يجب بعد`
      : phase === 'REVEAL'
        ? 'كُشفت الإجابة وإحصاءاتها'
        : phase === 'LEADERBOARD'
          ? 'يُعرض ترتيب الجولة الآن'
          : phase === 'FINISHED'
            ? 'اكتملت جميع أسئلة المسابقة'
            : 'بانتظار بدء السؤال الأول',
    autoAdvance ? 'الانتقال التلقائي مفعّل' : 'الانتقال التلقائي متوقف',
  ];

  useEffect(() => {
    if (
      !autoAdvance ||
      commandsDisabled ||
      phase !== 'REVEAL' ||
      !questionId ||
      autoAdvancedQuestion.current === questionId
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      autoAdvancedQuestion.current = questionId;
      nextQuestion();
    }, 2_000);
    return () => window.clearTimeout(timer);
  }, [autoAdvance, commandsDisabled, nextQuestion, phase, questionId]);

  useEffect(() => {
    if (!questionsOpen) return;
    questionNavigatorRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setQuestionsOpen(false);
      questionToggleRef.current?.focus();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [questionsOpen]);

  if (isLobby) {
    return (
      <RoyalHostLobby
        sessionId={sessionId}
        roomCode={roomCode}
        joinUrl={joinUrl}
        quizTitle={quizTitle}
        connected={game.connected}
        busy={game.busy}
        message={game.message}
        participantCount={participantCount}
        players={rankedPlayers}
        minimumPlayers={minimumPlayers}
        maxPlayers={maxPlayers}
        totalQuestions={totalQuestions}
        alerts={hostAlerts}
        soundEnabled={soundEnabled}
        settingsOpen={settingsOpen}
        autoAdvance={autoAdvance}
        questions={questions}
        questionId={questionId}
        questionsOpen={questionsOpen}
        questionToggleRef={questionToggleRef}
        questionNavigatorRef={questionNavigatorRef}
        onStart={game.startQuestion}
        onFinish={game.finishGame}
        onToggleSound={() => setSoundEnabled((value) => !value)}
        onToggleSettings={() => setSettingsOpen((value) => !value)}
        onToggleAutoAdvance={() => setAutoAdvance((value) => !value)}
        onToggleQuestions={() => setQuestionsOpen((value) => !value)}
        onCloseQuestions={() => {
          setQuestionsOpen(false);
          questionToggleRef.current?.focus();
        }}
      />
    );
  }

  return (
    <div
      className="royal-host-dashboard royal-live"
      data-phase={phase ?? 'CONNECTING'}
      aria-label="لوحة المضيف المباشرة"
    >
      <header className="royal-host-session-header" aria-label="شريط معلومات الجولة">
        <div className="royal-host-brand" aria-label="تحدّي — لوحة المضيف">
          <Crown aria-hidden="true" />
          <strong>تحدّي</strong>
          <span>{quizTitle}</span>
        </div>
        <dl className="royal-host-session-meta">
          <div>
            <dt>رمز الغرفة</dt>
            <dd dir="ltr">{roomCode}</dd>
          </div>
          <div>
            <dt>رقم الجولة</dt>
            <dd>
              {currentQuestionNumber === null
                ? 'لم يبدأ السؤال بعد'
                : `السؤال ${formatNumber(currentQuestionNumber)} من ${formatNumber(currentTotalQuestions)}`}
            </dd>
          </div>
          <div>
            <dt>حالة الجولة</dt>
            <dd>{phaseLabel}</dd>
          </div>
        </dl>
        <div className="royal-host-session-actions">
          <ButtonLink href="/profile" variant="ghost" size="sm">
            <UserCircle2 />
            ملف المدير
          </ButtonLink>
          <ButtonLink href="/leaderboard" variant="ghost" size="sm">
            <Trophy />
            لوحة الشرف
          </ButtonLink>
          <ButtonLink href="/host" variant="ghost" size="sm">
            <LogOut />
            العودة للمسابقات
          </ButtonLink>
          <Button
            ref={questionToggleRef}
            type="button"
            variant="ghost"
            size="sm"
            aria-controls="royal-host-question-navigator"
            aria-expanded={questionsOpen}
            onClick={() => setQuestionsOpen((value) => !value)}
          >
            <ListChecks />
            قائمة الأسئلة
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-controls="royal-host-live-insights"
            aria-expanded={showInsights}
            onClick={() => setInsightsOpen((value) => !value)}
          >
            <BarChart3 />
            إحصاءات البث
          </Button>
        </div>
      </header>

      {game.message && (
        <p className="royal-host-status-message" role="status">
          {game.message}
        </p>
      )}
      {!game.connected && snapshot && (
        <p className="royal-host-status-message" role="status">
          انقطع الاتصال. تُعرض آخر حالة محفوظة، وستتاح أدوات الجولة بعد استعادة الاتصال.
        </p>
      )}
      {game.busy && (
        <p className="royal-host-status-message" role="status">
          جارٍ تنفيذ الإجراء…
        </p>
      )}

      <div className="royal-host-dashboard-grid">
        <aside className="royal-host-ranking" aria-label="ترتيب المتسابقين المباشر">
          <div className="royal-host-panel-heading">
            <span>حتى الآن</span>
            <h2>الترتيب المباشر</h2>
          </div>
          {rankedPlayers.length ? (
            <ol>
              {rankedPlayers.slice(0, 8).map((player) => (
                <li key={player.id}>
                  <span>{formatNumber(player.rank)}</span>
                  <strong>{player.name}</strong>
                  {player.streak >= 2 && (
                    <span
                      className="royal-host-streak"
                      title={`سلسلة ${formatNumber(player.streak)} إجابات صحيحة متتالية`}
                      aria-label={`سلسلة ${formatNumber(player.streak)} إجابات صحيحة متتالية`}
                    >
                      <Flame aria-hidden="true" />
                      {formatNumber(player.streak)}
                    </span>
                  )}
                  <b>{formatNumber(player.score)}</b>
                </li>
              ))}
            </ol>
          ) : (
            <p>يظهر الترتيب فور دخول المتسابقين.</p>
          )}
        </aside>

        <section className="royal-host-question-workspace" aria-label="السؤال الحالي">
          {isConnecting ? (
            <section className="royal-host-connecting" aria-label="حالة اتصال المضيف">
              <WifiOff aria-hidden="true" />
              <h2>جارٍ الاتصال بالغرفة</h2>
              <p>ستظهر بوابة الانضمام بعد استلام حالة الجولة من الخادم.</p>
            </section>
          ) : isLobby ? (
            <section className="royal-host-lobby" id="royal-host-participants">
              <section className="royal-host-invite" aria-label="دعوة اللاعبين">
                <div className="royal-host-invite-copy">
                  <span>بوابة الدخول</span>
                  <h2>امسح الرمز وادخل الجولة</h2>
                  <p>شارك الرمز أو رابط الدعوة، وسيصل المتسابق مباشرة إلى الغرفة.</p>
                  <span
                    className={`royal-host-connection ${game.connected ? 'is-online' : 'is-offline'}`}
                  >
                    {game.connected ? <Wifi /> : <WifiOff />}
                    {game.connected ? 'الغرفة متصلة' : 'يعاد الاتصال'}
                  </span>
                </div>
                <RoomCode code={roomCode} url={joinUrl} />
              </section>
              <div className="royal-host-lobby-header">
                <div>
                  <span>الغرفة جاهزة</span>
                  <h2>شارك الرمز، ثم ابدأ السؤال الأول</h2>
                  <p>سيصل السؤال إلى جميع الأجهزة بتوقيت واحد صادر من الخادم.</p>
                </div>
                <Button
                  type="button"
                  size="lg"
                  onClick={game.startQuestion}
                  disabled={
                    commandsDisabled ||
                    participantCount < minimumPlayers ||
                    currentTotalQuestions === 0
                  }
                  title={
                    currentTotalQuestions === 0
                      ? 'أضف سؤالًا واحدًا على الأقل قبل بدء المسابقة'
                      : participantCount < minimumPlayers
                        ? `يلزم ${formatNumber(minimumPlayers)} متسابق على الأقل`
                        : undefined
                  }
                >
                  بدء السؤال الأول
                </Button>
              </div>
              <div className="royal-host-waiting-list" aria-label="قائمة انتظار المتسابقين">
                <div>
                  <strong>قائمة الانتظار</strong>
                  <span>
                    {currentTotalQuestions === 0
                      ? 'لا يمكن البدء قبل إضافة سؤال واحد على الأقل'
                      : participantCount >= minimumPlayers
                        ? `يمكن بدء الجولة الآن · ${formatNumber(participantCount)}${maxPlayers ? ` / ${formatNumber(maxPlayers)}` : ''} متسابق`
                        : `ينقص ${formatNumber(Math.max(0, minimumPlayers - participantCount))} متسابقين متصلين لبدء الجولة`}
                  </span>
                </div>
                {rankedPlayers.length ? (
                  <ol>
                    {rankedPlayers.map((player) => (
                      <li key={player.id}>
                        <span aria-hidden="true">{player.name.trim().slice(0, 1)}</span>
                        <strong>{player.name}</strong>
                        <small>ضمن الجولة</small>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>بانتظار أول متسابق…</p>
                )}
              </div>
            </section>
          ) : snapshot.phase === 'FINISHED' ? (
            <LiveFinaleExperience
              players={snapshot.leaderboard}
              soundEnabled={soundEnabled}
              roundNumber={snapshot.question?.questionNumber ?? currentTotalQuestions}
              totalRounds={currentTotalQuestions}
            />
          ) : snapshot.phase === 'LEADERBOARD' ? (
            <section className="royal-host-finish-card">
              <span>لحظة الترتيب</span>
              <h2>{topPlayers[0] ? `${topPlayers[0].name} في الصدارة` : 'يُحدّث الترتيب الآن'}</h2>
              <p>ستنتقل الجولة تلقائيًا إلى السؤال التالي.</p>
            </section>
          ) : snapshot.question ? (
            <>
              <div className="royal-host-question-stage-shell">
                <div className="royal-host-question-kicker">
                  <span className="royal-host-kicker-status" data-phase={snapshot.phase}>
                    <i className="royal-host-live-dot" aria-hidden="true" />
                    <strong>
                      {snapshot.phase === 'REVEAL' ? 'تم كشف الإجابة' : 'يستقبل الإجابات الآن'}
                    </strong>
                  </span>
                  <div className="royal-host-kicker-chips">
                    {hostQuestion?.question.category && (
                      <span>{formatNumber(hostQuestion.question.basePoints)} نقطة</span>
                    )}
                  </div>
                </div>
                <LiveQuestionStage
                  question={snapshot.question}
                  phase={snapshot.phase}
                  reveal={snapshot.reveal}
                  stats={game.stats}
                  clockOffset={game.clockOffset}
                  hostCorrectOptionId={hostCorrectOptionId}
                  category={hostQuestion?.question.category ?? undefined}
                  points={hostQuestion?.question.basePoints}
                  className="royal-question-stage--host"
                />
                <div className="royal-host-answer-progress">
                  <strong>
                    أجاب {formatNumber(answeredCount)} من {formatNumber(activeCount)} متسابقين
                  </strong>
                  <span
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={answerPercentage}
                    aria-label="نسبة الإجابات"
                  >
                    <i style={{ width: `${answerPercentage}%` }} />
                  </span>
                  <b>{formatNumber(answerPercentage)}٪</b>
                </div>
              </div>

              <div className="royal-host-question-actions" aria-label="إجراءات السؤال">
                <Button
                  type="button"
                  variant="gold"
                  className="royal-host-tool-primary"
                  onClick={game.nextQuestion}
                  disabled={commandsDisabled || snapshot.phase !== 'REVEAL'}
                >
                  <SkipForward />
                  {currentQuestionNumber === currentTotalQuestions
                    ? 'عرض النتيجة النهائية'
                    : 'السؤال التالي'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => questionId && game.revealQuestion(questionId)}
                  disabled={commandsDisabled || snapshot.phase !== 'QUESTION'}
                  title="إغلاق استقبال الإجابات وكشف الحل لجميع المتسابقين"
                >
                  <Eye />
                  إظهار الإجابة
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={game.skipQuestion}
                  disabled={commandsDisabled || snapshot.phase !== 'QUESTION'}
                  title="يكشف الإجابة فورًا وينتقل للسؤال التالي"
                >
                  <ListRestart />
                  تخطي السؤال
                </Button>
              </div>
            </>
          ) : null}

          {snapshot && snapshot.phase !== 'FINISHED' && (
            <div className="royal-host-utility-toolbar" aria-label="أدوات الجولة">
              <button
                type="button"
                className="royal-host-icon-button"
                aria-label={soundEnabled ? 'كتم الصوت' : 'تشغيل الصوت'}
                aria-pressed={!soundEnabled}
                onClick={() => setSoundEnabled((value) => !value)}
              >
                {soundEnabled ? <Volume2 /> : <VolumeX />}
                <span>{soundEnabled ? 'كتم الصوت' : 'تشغيل الصوت'}</span>
              </button>
              <button
                type="button"
                className="royal-host-icon-button"
                aria-label="إعدادات العرض"
                aria-controls="royal-host-display-settings"
                aria-expanded={settingsOpen}
                onClick={() => setSettingsOpen((value) => !value)}
              >
                <Settings />
                <span>إعدادات العرض</span>
              </button>
              {settingsOpen && (
                <button
                  type="button"
                  className="royal-host-auto-advance"
                  id="royal-host-display-settings"
                  aria-label="الانتقال التلقائي"
                  aria-pressed={autoAdvance}
                  onClick={() => setAutoAdvance((value) => !value)}
                >
                  <span>الانتقال التلقائي</span>
                  <strong>{autoAdvance ? 'مفعّل' : 'متوقف'}</strong>
                </button>
              )}
              {hostQuestion ? (
                <ButtonLink href={`/questions/${hostQuestion.question.id}`} variant="secondary">
                  <SlidersHorizontal />
                  تحرير السؤال
                </ButtonLink>
              ) : null}
              <ButtonLink
                href={`/display?sessionId=${encodeURIComponent(sessionId)}`}
                variant="secondary"
                target="_blank"
              >
                <ExternalLink />
                عرض شاشة العرض
              </ButtonLink>
              <Button
                type="button"
                variant="secondary"
                aria-controls="royal-host-participant-drawer"
                aria-expanded={participantsOpen}
                onClick={() => setParticipantsOpen((value) => !value)}
              >
                <UsersRound />
                إدارة المشاركين
              </Button>
              {participantsOpen && (
                <div className="royal-host-participant-drawer" id="royal-host-participant-drawer">
                  {rankedPlayers.length ? (
                    rankedPlayers.map((player) => <span key={player.id}>{player.name}</span>)
                  ) : (
                    <span>لا يوجد لاعبون بعد</span>
                  )}
                </div>
              )}
              <Button
                type="button"
                variant="destructive"
                className="royal-host-tool-danger"
                onClick={game.finishGame}
                disabled={commandsDisabled}
              >
                <Square />
                إنهاء الجولة
              </Button>
            </div>
          )}
        </section>

        {showInsights ? (
          <aside
            className="royal-host-live-insights"
            id="royal-host-live-insights"
            aria-label="إحصاءات البث المباشر"
          >
            <section aria-label="الإجابات المباشرة">
              <div className="royal-host-panel-heading">
                <span>{formatNumber(answeredCount)} إجابة</span>
                <h2>الإجابات المباشرة</h2>
              </div>
              {answerStats.length ? (
                <ol className="royal-host-answer-feed">
                  {answerStats.map((option) => (
                    <li key={option.id}>
                      <div>
                        <span>{option.text}</span>
                        <strong>{formatNumber(option.percentage)}٪</strong>
                      </div>
                      <span aria-hidden="true">
                        <i style={{ width: `${option.percentage}%` }} />
                      </span>
                      <small>{formatNumber(option.count)} إجابة</small>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>تظهر الإجابات فور فتح السؤال.</p>
              )}
            </section>
          </aside>
        ) : (
          <aside className="royal-host-live-insights royal-host-live-insights--closed">
            <p>الإحصاءات مخفية مؤقتًا.</p>
          </aside>
        )}

        <section className="royal-host-round-stats" aria-label="إحصائيات الجولة">
          <div className="royal-host-panel-heading">
            <span>{phaseLabel}</span>
            <h2>إحصائيات الجولة</h2>
          </div>
          <dl>
            <div>
              <dt>المشاركون</dt>
              <dd>{formatNumber(activeCount)}</dd>
            </div>
            <div>
              <dt>أجاب</dt>
              <dd>{formatNumber(answeredCount)}</dd>
            </div>
            <div>
              <dt>لم يجب</dt>
              <dd>{formatNumber(unansweredCount)}</dd>
            </div>
            <div>
              <dt>نسبة الإجابات</dt>
              <dd>{formatNumber(answerPercentage)}٪</dd>
            </div>
          </dl>
        </section>

        <section
          className="royal-host-podium"
          aria-label="منصة أفضل ثلاثة متسابقين"
          aria-live="polite"
          data-finished={phase === 'FINISHED'}
        >
          <div className="royal-host-panel-heading">
            <span>{phase === 'FINISHED' ? 'النتيجة النهائية' : 'المنصة المباشرة'}</span>
            <h2>{phase === 'FINISHED' ? 'الفائز' : 'أفضل ثلاثة متسابقين'}</h2>
          </div>
          {topPlayers.length ? (
            <ol>
              {topPlayers.map((player) => (
                <li key={player.id} data-rank={player.rank}>
                  <span>{formatNumber(player.rank)}</span>
                  <strong>{player.name}</strong>
                  <b>{formatNumber(player.score)}</b>
                </li>
              ))}
            </ol>
          ) : (
            <p>تُضاء المنصة بعد تسجيل أول نقاط.</p>
          )}
        </section>

        <aside className="royal-host-alerts" aria-label="تنبيهات المضيف">
          <div className="royal-host-panel-heading">
            <span>النظام</span>
            <h2>تنبيهات المضيف</h2>
          </div>
          <ul>
            {hostAlerts.map((alert, index) => (
              <li
                key={alert}
                data-level={index === 1 && unansweredCount > 0 ? 'attention' : 'normal'}
              >
                <i aria-hidden="true" />
                <span>{alert}</span>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      {questionsOpen && (
        <aside
          ref={questionNavigatorRef}
          className="royal-host-question-navigator"
          id="royal-host-question-navigator"
          aria-label="قائمة أسئلة الجولة"
          tabIndex={-1}
        >
          <div className="royal-host-question-navigator__heading">
            <h2>قائمة الأسئلة</h2>
            <button type="button" onClick={() => setQuestionsOpen(false)}>
              إغلاق
            </button>
          </div>
          {questions.length > 0 ? (
            <ol>
              {questions.map((quizQuestion, index) => {
                const isCurrent = quizQuestion.question.id === questionId;
                return (
                  <li key={quizQuestion.questionId} data-current={isCurrent}>
                    <span>{formatNumber(index + 1)}</span>
                    <strong>{quizQuestion.question.prompt}</strong>
                    {isCurrent && <small>الحالي</small>}
                  </li>
                );
              })}
            </ol>
          ) : (
            <p>ستظهر القائمة بعد اختيار المسابقة.</p>
          )}
        </aside>
      )}
    </div>
  );
}

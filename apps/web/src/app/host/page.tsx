import { ArrowUpLeft, Activity, CirclePlay, MonitorPlay, Plus, Radio, Users, Zap, Trophy } from 'lucide-react';
import { startLiveSession } from '@/app/live/actions';
import { HostLayout } from '@/components/layout';
import { LiveHostExperience } from '@/components/live';
import { Button, ButtonLink } from '@/components/ui';
import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import { requireActiveUser } from '@/lib/auth/session';
import { createHostLiveAccessToken } from '@/lib/live/access-token';
import { formatNumber } from '@/lib/utils';
import styles from './host-dashboard.module.css';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ sessionId?: string; liveError?: string }>;
}) {
  const [{ sessionId, liveError }, user] = await Promise.all([
    searchParams,
    requireActiveUser('/host'),
  ]);
  const prisma = hasDatabaseUrl() ? getPrismaClient() : null;
  const [selectedSession, sessions, quizzes] = prisma
    ? await Promise.all([
        sessionId
          ? prisma.liveSession.findFirst({
              where: { id: sessionId, hostId: user.id },
              select: {
                id: true,
                roomCode: true,
                status: true,
                currentQuestionPosition: true,
                quiz: {
                  select: {
                    title: true,
                    maxPlayers: true,
                    autoAdvance: true,
                    _count: { select: { questions: true } },
                    questions: {
                      orderBy: { position: 'asc' },
                      select: {
                        questionId: true,
                        question: {
                          select: {
                            id: true,
                            prompt: true,
                            imageUrl: true,
                            category: { select: { name: true } },
                            timeLimit: true,
                            basePoints: true,
                            options: {
                              orderBy: { position: 'asc' },
                              select: { id: true, text: true, isCorrect: true },
                            },
                          },
                        },
                      },
                    },
                  },
                },
                _count: { select: { participants: true, answers: true } },
              },
            })
          : null,
        prisma.liveSession.findMany({
          where: { hostId: user.id, status: { in: ['WAITING', 'ACTIVE'] } },
          orderBy: { createdAt: 'desc' },
          take: 6,
          select: {
            id: true,
            roomCode: true,
            status: true,
            quiz: { select: { title: true } },
            _count: { select: { participants: true } },
          },
        }),
        prisma.quiz.findMany({
          where: { ownerId: user.id, status: { not: 'ARCHIVED' }, gameMode: 'QUIZ' },
          orderBy: { updatedAt: 'desc' },
          take: 12,
          select: {
            id: true,
            title: true,
            description: true,
            roomCode: true,
            status: true,
            gameMode: true,
            questions: {
              orderBy: { position: 'asc' },
              select: { question: { select: { id: true, prompt: true } } },
            },
            _count: { select: { questions: true } },
          },
        }),
      ]).catch(() => [null, [], []] as const)
    : [null, [], []];

  const siteUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
  const hostAccessToken = selectedSession
    ? createHostLiveAccessToken(selectedSession.id, user.id)
    : '';

  const liveSessionCount =
    selectedSession?._count.participants ??
    sessions.reduce((total, session) => total + session._count.participants, 0);
  const quizCount = quizzes.length;
  const hasReadyQuiz = quizzes.some((quiz) => quiz._count.questions > 0);
  const activeSessionCount = sessions.filter((session) => session.status === 'ACTIVE').length;
  const broadcastHref = selectedSession ? `/display?sessionId=${selectedSession.id}` : '/display';
  const selectedQuestions =
    selectedSession?.quiz.questions.map((item) => ({
      ...item,
      question: {
        ...item.question,
        category: item.question.category?.name ?? null,
      },
    })) ?? [];
  const totalQuestionCount = selectedSession?.quiz._count.questions ?? selectedQuestions.length;

  if (selectedSession) {
    return (
      <main>
        <LiveHostExperience
          sessionId={selectedSession.id}
          hostId={user.id}
          accessToken={hostAccessToken}
          roomCode={selectedSession.roomCode}
          joinUrl={`${siteUrl.replace(/\/$/, '')}/join/${selectedSession.roomCode}`}
          initialAutoAdvance={selectedSession.quiz.autoAdvance}
          quizTitle={selectedSession.quiz.title}
          minimumPlayers={1}
          maxPlayers={selectedSession.quiz.maxPlayers}
          totalQuestions={totalQuestionCount}
          questions={selectedQuestions}
        />
      </main>
    );
  }

  return (
    <HostLayout players={liveSessionCount}>
      <div className={styles.dashboard}>
        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}><Radio aria-hidden="true" /> مركز البث المباشر</span>
            <h1>لوحة المضيف</h1>
            <p>ابدأ مسابقة، تابع الغرف المفتوحة، وجهّز شاشة العرض من مكان واحد.</p>
            <div className={styles.heroActions}>
              <ButtonLink href={hasReadyQuiz ? '#quizzes' : quizCount > 0 ? '/quizzes' : '/quizzes/new'} variant="gold">
                <CirclePlay aria-hidden="true" />
                {hasReadyQuiz ? 'ابدأ مسابقة' : quizCount > 0 ? 'جهّز مسابقة' : 'أنشئ أول مسابقة'}
              </ButtonLink>
              <ButtonLink href={broadcastHref} variant="outline">
                <MonitorPlay aria-hidden="true" /> شاشة العرض
              </ButtonLink>
            </div>
          </div>
          <div className={styles.heroStatus} aria-label="ملخص البث">
            <div className={styles.statusTop}>
              <span className={styles.statusLabel}>الغرف المعروضة</span>
              <span className={styles.liveMarker}><Activity aria-hidden="true" /> {activeSessionCount > 0 ? 'بث مباشر قيد التشغيل' : 'جاهز للبث'}</span>
            </div>
            <strong>{formatNumber(liveSessionCount)}</strong>
            <span className={styles.statusCaption}>مشاركون في الغرف</span>
            <div className={styles.statusBottom}>
              <span><Users aria-hidden="true" /> {formatNumber(activeSessionCount)} نشطة</span>
              <span><Trophy aria-hidden="true" /> {formatNumber(quizCount)} مسابقة معروضة</span>
            </div>
          </div>
        </header>

        {liveError && (
          <div className={styles.alert} role="alert">
            <Zap aria-hidden="true" />
            <div>
              <strong>تعذّر تشغيل المسابقة</strong>
              <p>
                {liveError === 'gameMode'
                  ? 'البث الكلاسيكي يقبل حزم المسابقة العادية فقط. شغّل أوضاع السلم والمليون ولوحة الفئات من صفحاتها.'
                  : liveError === 'quota'
                    ? 'تعذّر التحقق من حصة الغرف المباشرة. أعد المحاولة بعد قليل، وإن تكرر الأمر راجع قاعة الأوسمة أو الدعم.'
                    : liveError === 'quizOptions'
                      ? 'تحتوي هذه المسابقة على أسئلة بلا خيارات إجابة، وأُرسلت للإصلاح تلقائيًا. أعد المحاولة بعد لحظات.'
                      : 'تأكد بأنها تحتوي على سؤال واحد على الأقل، وأن وضعها هو المسابقة الكلاسيكية.'}
              </p>
            </div>
          </div>
        )}

        <div className={styles.workspace}>
          <div className={styles.main}>
            <section className={styles.section} aria-labelledby="host-rooms-title">
              <div className={styles.sectionHeading}>
                <div>
                  <span className={styles.sectionKicker}>01 / الغرف</span>
                  <h2 id="host-rooms-title">أحدث غرفك المباشرة</h2>
                </div>
                <span className={styles.countBadge}>{formatNumber(sessions.length)} غرف معروضة</span>
              </div>
              {sessions.length > 0 ? (
                <div className={styles.roomList}>
                  {sessions.map((session) => (
                    <article className={styles.roomRow} key={session.id}>
                      <div className={styles.roomDetail}>
                        <span className={styles.roomState} data-active={session.status === 'ACTIVE'}>
                          <span className={styles.stateDot} aria-hidden="true" />
                          {session.status === 'WAITING' ? 'بانتظار اللاعبين' : 'المسابقة جارية'}
                        </span>
                        <h3>{session.quiz.title}</h3>
                        <p>رمز الغرفة <bdi className={styles.roomCode}>{session.roomCode}</bdi><span aria-hidden="true"> · </span>{formatNumber(session._count.participants)} مشارك</p>
                      </div>
                      <ButtonLink href={`/host?sessionId=${session.id}`} variant="gold" size="sm" className={styles.rowAction}>
                        متابعة الغرفة <ArrowUpLeft aria-hidden="true" />
                      </ButtonLink>
                    </article>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <span className={styles.emptyIcon}><Radio aria-hidden="true" /></span>
                  <h3>لا توجد غرف مفتوحة الآن</h3>
                  <p>اختر مسابقة من القائمة لفتح غرفة جديدة واستقبال اللاعبين.</p>
                  <ButtonLink href={quizCount > 0 ? '#quizzes' : '/quizzes/new'} variant="outline">
                    {quizCount > 0 ? 'تصفح مسابقاتك' : 'أنشئ مسابقة'}
                  </ButtonLink>
                </div>
              )}
            </section>

            <section className={styles.section} id="quizzes" aria-labelledby="host-quizzes-title">
              <div className={styles.sectionHeading}>
                <div>
                  <span className={styles.sectionKicker}>02 / التشغيل</span>
                  <h2 id="host-quizzes-title">اختر مسابقة لتشغيلها</h2>
                </div>
                <ButtonLink href="/quizzes/new" variant="outline" size="sm">
                  <Plus aria-hidden="true" /> مسابقة جديدة
                </ButtonLink>
              </div>
              {quizzes.length > 0 ? (
                <div className={styles.quizList}>
                  {quizzes.map((quiz, index) => (
                    <article key={quiz.id} className={styles.quizRow}>
                      <span className={styles.quizIndex} aria-hidden="true">{formatNumber(index + 1).padStart(2, '0')}</span>
                      <div className={styles.quizDetail}>
                        <h3>{quiz.title}</h3>
                        <p>{formatNumber(quiz._count.questions)} سؤال <span aria-hidden="true">·</span> {quiz.status === 'ACTIVE' ? 'منشورة' : 'مسودة'}{quiz._count.questions === 0 ? ' · أضف أسئلة قبل التشغيل' : ''}</p>
                      </div>
                      {quiz._count.questions > 0 ? (
                        <form action={startLiveSession} className={styles.quizAction}>
                          <input type="hidden" name="quizId" value={quiz.id} />
                          <Button type="submit" variant="gold" size="sm">
                            <CirclePlay aria-hidden="true" /> تشغيل
                          </Button>
                        </form>
                      ) : (
                        <ButtonLink href="/quizzes" variant="outline" size="sm" className={styles.quizAction}>
                          إدارة
                        </ButtonLink>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <span className={styles.emptyIcon}><Trophy aria-hidden="true" /></span>
                  <h3>ابدأ بأول مسابقة</h3>
                  <p>أنشئ مسابقة وأضف أسئلتها، ثم عد إلى هنا لفتح غرفة مباشرة.</p>
                  <ButtonLink href="/quizzes/new" variant="gold"><Plus aria-hidden="true" /> إنشاء مسابقة</ButtonLink>
                </div>
              )}
            </section>
          </div>

          <aside className={styles.aside} aria-label="أدوات المضيف">
            <section className={styles.helpCard} aria-labelledby="host-join-title">
              <span className={styles.helpIcon}><Users aria-hidden="true" /></span>
              <h2 id="host-join-title">دعوة اللاعبين</h2>
              <p>بعد فتح الغرفة، شارك رمزها أو رابطها. يدخل اللاعبون بالاسم دون حساب.</p>
              <ButtonLink href="/join" variant="outline" fullWidth>فتح صفحة الانضمام <ArrowUpLeft aria-hidden="true" /></ButtonLink>
            </section>
            <section className={styles.helpCard} aria-labelledby="host-display-title">
              <span className={styles.helpIcon}><MonitorPlay aria-hidden="true" /></span>
              <h2 id="host-display-title">شاشة الجمهور</h2>
              <p>اعرض الجولة على شاشة منفصلة ليشاهد الجميع الأسئلة والنتائج.</p>
              <ButtonLink href={broadcastHref} variant="outline" fullWidth>فتح شاشة العرض <ArrowUpLeft aria-hidden="true" /></ButtonLink>
            </section>
          </aside>
        </div>
      </div>
    </HostLayout>
  );
}

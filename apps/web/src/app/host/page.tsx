import { MonitorPlay, Radio, Users, Zap, Trophy } from 'lucide-react';
import { startLiveSession } from '@/app/live/actions';
import { HostLayout } from '@/components/layout';
import { LiveHostExperience } from '@/components/live';
import { Button, ButtonLink, EmptyState } from '@/components/ui';
import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import { requireActiveUser } from '@/lib/auth/session';
import { createHostLiveAccessToken } from '@/lib/live/access-token';
import { formatNumber } from '@/lib/utils';

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

  const liveSessionCount = selectedSession?._count.participants ?? 0;
  const quizCount = quizzes.length;
  const activeSessionCount = sessions.length;
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
          totalQuestions={totalQuestionCount}
          questions={selectedQuestions}
        />
      </main>
    );
  }

  return (
    <HostLayout players={liveSessionCount}>
      <div className="host-stage royal-host-hub royal-live">
        <div className="host-main">
          <header className="host-main-header">
            <div>
              <span className="eyebrow royal-live-kicker">
                <Radio />
                02 · تشغيل مباشر
              </span>
              <h1>لوحة المضيف</h1>
              <p>تحكم كامل بالجولة، ومراقبة مباشرة للاعبين والأجوبة.</p>
              <div className="host-command-strip" aria-label="حالة غرفة المضيف">
                <span>اختر غرفة للتشغيل</span>
                <span>{formatNumber(liveSessionCount)} لاعب</span>
                <span>شاشة جاهزة</span>
              </div>
            </div>
            <div className="host-main-header__actions">
              <ButtonLink href={broadcastHref} variant="outline">
                <MonitorPlay aria-hidden="true" />
                شاشة العرض
              </ButtonLink>
              <ButtonLink href="/quizzes/new" variant="gold">
                <Trophy aria-hidden="true" />
                مسابقة جديدة
              </ButtonLink>
            </div>
          </header>

          {liveError && (
            <div className="host-alert host-alert--danger" role="alert">
              <Zap aria-hidden="true" />
              <div>
                <strong>تعذّر تشغيل المسابقة</strong>
                <span>
                  {liveError === 'gameMode'
                    ? 'البث الكلاسيكي يقبل حزم المسابقة العادية فقط. شغّل أوضاع السلم والمليون ولوحة الفئات من صفحاتها.'
                    : liveError === 'quota'
                      ? 'تعذّر التحقق من حصة الغرف المباشرة. أعد المحاولة بعد قليل، وإن تكرر الأمر راجع قاعة الأوسمة أو الدعم.'
                      : liveError === 'quizOptions'
                        ? 'تحتوي هذه المسابقة على أسئلة بلا خيارات إجابة، وأُرسلت للإصلاح تلقائيًا. أعد المحاولة بعد لحظات.'
                        : 'تأكد بأنها تحتوي على سؤال واحد على الأقل، وأن وضعها هو المسابقة الكلاسيكية.'}
                </span>
              </div>
            </div>
          )}

          <div className="host-stats">
            <div className="host-stat">
              <Users aria-hidden="true" />
              <div>
                <strong>{formatNumber(liveSessionCount)}</strong>
                <span>لاعب متصل</span>
              </div>
            </div>
            <div className="host-stat">
              <Trophy aria-hidden="true" />
              <div>
                <strong>{formatNumber(quizCount)}</strong>
                <span>مسابقة جاهزة</span>
              </div>
            </div>
            <div className="host-stat">
              <Zap aria-hidden="true" />
              <div>
                <strong>{formatNumber(activeSessionCount)}</strong>
                <span>جلسة نشطة</span>
              </div>
            </div>
          </div>

          <div className="host-main-content">
            <EmptyState
              title="اختر مسابقة لتشغيلها"
              description="المسابعات المحفوظة في حسابك تظهر أدناه ويمكن فتح غرفة مباشرة منها."
            />
          </div>
        </div>

        <aside className="host-sidebar">
          <div className="host-panel">
            <div className="host-panel__header">
              <span className="host-panel__title">
                <Trophy aria-hidden="true" />
                مسابقاتك
              </span>
              <span className="host-panel__badge">{formatNumber(quizCount)}</span>
            </div>
            <div className="host-quiz-grid">
              {quizzes.map((quiz) => (
                <div key={quiz.id} className="host-quiz-row">
                  <span className="host-quiz-row__number" dir="ltr">
                    {quiz.roomCode?.slice(0, 2) ?? '--'}
                  </span>
                  <div className="host-quiz-row__content">
                    <h4>{quiz.title}</h4>
                    <p>
                      {formatNumber(quiz._count.questions)} سؤال ·{' '}
                      {quiz.status === 'ACTIVE' ? 'منشورة' : 'مسودة'}
                    </p>
                  </div>
                  <form action={startLiveSession} className="host-quiz-row__actions">
                    <input type="hidden" name="quizId" value={quiz.id} />
                    <Button
                      type="submit"
                      variant="gold"
                      size="sm"
                      disabled={quiz._count.questions === 0}
                    >
                      تشغيل
                    </Button>
                  </form>
                </div>
              ))}
            </div>
          </div>

          <div className="host-panel host-panel--cta">
            <div className="host-panel__header">
              <span className="host-panel__title">
                <Users aria-hidden="true" />
                انضم بالرمز
              </span>
            </div>
            <p
              style={{
                margin: 0,
                color: 'var(--muted-foreground)',
                fontSize: '0.88rem',
                lineHeight: 1.6,
              }}
            >
              شارك رابط الجلسة مع اللاعبين. يدخلون بالاسم فقط، بلا حساب.
            </p>
            <ButtonLink href="/join" variant="outline" fullWidth>
              فتح صفحة الانضمام
            </ButtonLink>
          </div>
        </aside>
      </div>
    </HostLayout>
  );
}

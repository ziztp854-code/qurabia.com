import type { Metadata } from 'next';
import type { QuestionRevealPayload, QuestionStatsPayload } from '@tahaddi/contracts';
import { Crown, MonitorPlay } from 'lucide-react';
import { BroadcastLayout } from '@/components/layout';
import {
  CinematicQuizExperience,
  type CinematicQuizData,
} from '@/components/live/cinematic-quiz-experience';
import { RoomPoller } from '@/components/live/room-poller';
import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import { deriveHttpGamePhase } from '@/lib/live/http-phase';
import { SITE_URL } from '@/lib/metadata/site';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'شاشة العرض | تحدّي',
  description: 'شاشة العرض السينمائية للمسابقات المباشرة في تحدّي.',
  alternates: { canonical: '/display' },
};

const previewPlayers = [
  { id: 'p1', name: 'سارة عبدالله', score: 3_250, rank: 1, streak: 3 },
  { id: 'p2', name: 'عبدالعزيز محمد', score: 2_875, rank: 2, streak: 2 },
  { id: 'p3', name: 'نورة فيصل', score: 2_410, rank: 3, streak: 1 },
];

function previewData(overrides: Partial<CinematicQuizData> = {}): CinematicQuizData {
  return {
    roomCode: 'PREVIEW',
    joinUrl: 'https://qurabia.com/join/PREVIEW',
    participantCount: 3,
    totalQuestions: 10,
    phase: 'LOBBY',
    question: null,
    reveal: null,
    stats: null,
    players: previewPlayers,
    clockOffset: 0,
    connected: true,
    busy: false,
    ...overrides,
  };
}

function DisplayWaiting() {
  return (
    <div className="royal-live display-waiting">
      <span className="display-waiting__mark" aria-hidden="true">
        <Crown />
      </span>
      <MonitorPlay aria-hidden="true" />
      <h1>شاشة العرض جاهزة</h1>
      <p>ابدأ الجولة من لوحة المضيف</p>
      <div className="display-waiting__pulse" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}

export default async function DisplayPage({
  searchParams,
}: {
  searchParams: Promise<{ sessionId?: string; preview?: string }>;
}) {
  const { sessionId, preview } = await searchParams;
  if (preview === 'lobby') {
    return (
      <CinematicQuizExperience
        screen="lobby"
        data={previewData({ roomCode: '123456', joinUrl: 'https://qurabia.com/join/123456' })}
      />
    );
  }
  if (preview === 'player' || preview === 'host') {
    // This dynamic server route snapshots the clock once for the preview timer.
    // eslint-disable-next-line react-hooks/purity
    const questionStartedAt = Date.now();
    const question = {
      questionId: 'reference-preview-question',
      prompt: 'ما هي عاصمة المملكة العربية السعودية؟',
      options: [
        { id: 'preview-a', text: 'الرياض', position: 0 },
        { id: 'preview-b', text: 'جدة', position: 1 },
        { id: 'preview-c', text: 'الدمام', position: 2 },
        { id: 'preview-d', text: 'مكة المكرمة', position: 3 },
      ],
      media: [],
      questionStartedAt,
      questionEndsAt: questionStartedAt + 15_000,
      questionNumber: 4,
      totalQuestions: 8,
    };

    return (
      <CinematicQuizExperience
        screen={preview === 'host' ? 'host' : 'question'}
        data={previewData({ phase: 'QUESTION', question })}
      />
    );
  }
  if (preview === 'question' || preview === 'reveal' || preview === 'long') {
    // This dynamic server route snapshots the clock once for the preview timer.
    // eslint-disable-next-line react-hooks/purity
    const questionStartedAt = Date.now();
    const options = [
      { id: 'preview-a', text: 'الرياض', position: 0 },
      { id: 'preview-b', text: 'جدة', position: 1 },
      { id: 'preview-c', text: 'الدمام', position: 2 },
      { id: 'preview-d', text: 'مكة المكرمة', position: 3 },
    ];
    const previewStats: QuestionStatsPayload = {
      questionId: 'preview-question',
      answeredCount: 4,
      participantCount: 6,
      options: options.map((option, index) => ({
        optionId: option.id,
        count: index === 0 ? 4 : 0,
        percentage: index === 0 ? 100 : 0,
      })),
    };
    const question = {
      questionId: 'preview-question',
      prompt:
        preview === 'long'
          ? 'في رحلة علمية طويلة لدراسة الكواكب، أي كوكب يُعرف باسم الكوكب الأحمر بسبب أكاسيد الحديد المنتشرة على سطحه؟'
          : 'ما هي عاصمة المملكة العربية السعودية؟',
      options,
      media: [],
      questionStartedAt,
      questionEndsAt: questionStartedAt + 15_000,
      questionNumber: 5,
      totalQuestions: 15,
    };
    const reveal =
      preview === 'reveal'
        ? {
            questionId: 'preview-question',
            correctOptionId: 'preview-a',
            explanation: null,
            stats: previewStats,
          }
        : null;
    return (
      <CinematicQuizExperience
        screen={preview === 'reveal' ? 'reveal' : 'question'}
        data={previewData({
          phase: preview === 'reveal' ? 'REVEAL' : 'QUESTION',
          question,
          reveal,
          stats: previewStats,
        })}
      />
    );
  }

  if (preview === 'finale') {
    return <CinematicQuizExperience screen="finale" data={previewData({ phase: 'FINISHED' })} />;
  }
  if (!sessionId || !hasDatabaseUrl()) {
    return (
      <BroadcastLayout>
        <DisplayWaiting />
      </BroadcastLayout>
    );
  }

  const session = await getPrismaClient().liveSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      roomCode: true,
      status: true,
      currentQuestionPosition: true,
      questionStartedAt: true,
      questionAdvanceAt: true,
      quiz: {
        select: {
          title: true,
          questions: {
            orderBy: { position: 'asc' },
            select: {
              question: {
                select: {
                  id: true,
                  prompt: true,
                  imageUrl: true,
                  type: true,
                  explanation: true,
                  timeLimit: true,
                  options: {
                    orderBy: { position: 'asc' },
                    select: { id: true, text: true, position: true, isCorrect: true },
                  },
                },
              },
            },
          },
        },
      },
      participants: {
        orderBy: [{ score: 'desc' }, { joinedAt: 'asc' }],
        select: {
          id: true,
          displayName: true,
          score: true,
          correctCount: true,
          status: true,
          joinedAt: true,
        },
      },
      answers: {
        select: {
          participantId: true,
          questionId: true,
          optionId: true,
          isCorrect: true,
          receivedAt: true,
        },
      },
    },
  });

  if (!session) {
    return (
      <BroadcastLayout>
        <DisplayWaiting />
      </BroadcastLayout>
    );
  }

  if (session.status === 'FINISHED') {
    return (
      <CinematicQuizExperience
        screen="finale"
        data={{
          roomCode: session.roomCode,
          joinUrl: new URL(`/join/${session.roomCode}`, SITE_URL).toString(),
          participantCount: session.participants.length,
          totalQuestions: session.quiz.questions.length,
          phase: 'FINISHED',
          question: null,
          reveal: null,
          stats: null,
          players: session.participants.map((participant, index) => ({
            id: participant.id,
            name: participant.displayName,
            score: participant.score,
            rank: index + 1,
            streak: 0,
            correctAnswers: participant.correctCount,
          })),
          clockOffset: 0,
          connected: true,
          busy: false,
        }}
      />
    );
  }

  const currentQuestion = session.quiz.questions[session.currentQuestionPosition]?.question;
  const questionStartedAt = session.questionStartedAt?.getTime() ?? null;
  if (!currentQuestion || !questionStartedAt) {
    return (
      <>
        {session.status === 'ACTIVE' && (
          <RoomPoller endpoint={`/api/live/${session.id}/tick`} intervalMs={1_000} />
        )}
        <CinematicQuizExperience
          screen="lobby"
          data={{
            roomCode: session.roomCode,
            joinUrl: new URL(`/join/${session.roomCode}`, SITE_URL).toString(),
            participantCount: session.participants.length,
            totalQuestions: session.quiz.questions.length,
            phase: 'LOBBY',
            question: null,
            reveal: null,
            stats: null,
            players: session.participants.map((participant, index) => ({
              id: participant.id,
              name: participant.displayName,
              score: participant.score,
              rank: index + 1,
              streak: 0,
            })),
            clockOffset: 0,
            connected: true,
            busy: false,
          }}
        />
      </>
    );
  }

  const questionEndsAt = questionStartedAt + currentQuestion.timeLimit * 1_000;
  const eligiblePlayers = session.participants.filter(
    (participant) => participant.joinedAt.getTime() <= questionStartedAt,
  );
  const currentAnswers = session.answers.filter(
    (answer) => answer.questionId === currentQuestion.id,
  );
  const answeredParticipants = new Set(currentAnswers.map((answer) => answer.participantId));
  const optionCounts = new Map(currentQuestion.options.map((option) => [option.id, 0]));
  currentAnswers.forEach((answer) => {
    optionCounts.set(answer.optionId, (optionCounts.get(answer.optionId) ?? 0) + 1);
  });
  const stats: QuestionStatsPayload = {
    questionId: currentQuestion.id,
    answeredCount: answeredParticipants.size,
    participantCount: eligiblePlayers.length,
    options: currentQuestion.options.map((option) => ({
      optionId: option.id,
      count: optionCounts.get(option.id) ?? 0,
      percentage:
        answeredParticipants.size > 0
          ? Math.round(((optionCounts.get(option.id) ?? 0) / answeredParticipants.size) * 100)
          : 0,
    })),
  };
  // The HTTP fallback derives one stable phase from the request-time snapshot.
  // eslint-disable-next-line react-hooks/purity
  const requestTime = Date.now();
  const phase = deriveHttpGamePhase({
    status: session.status,
    questionStartedAt,
    questionEndsAt,
    questionAdvanceAt: session.questionAdvanceAt?.getTime() ?? null,
    allAnswered: stats.participantCount > 0 && stats.answeredCount >= stats.participantCount,
    now: requestTime,
  });
  const correctOption = currentQuestion.options.find((option) => option.isCorrect);
  const reveal: QuestionRevealPayload | null =
    phase === 'REVEAL' && correctOption
      ? {
          questionId: currentQuestion.id,
          correctOptionId: correctOption.id,
          explanation: currentQuestion.explanation,
          stats,
        }
      : null;
  return (
    <>
      <RoomPoller endpoint={`/api/live/${session.id}/tick`} intervalMs={1_000} />
      <CinematicQuizExperience
        screen={
          phase === 'REVEAL' ? 'reveal' : phase === 'LEADERBOARD' ? 'leaderboard' : 'question'
        }
        data={{
          roomCode: session.roomCode,
          joinUrl: new URL(`/join/${session.roomCode}`, SITE_URL).toString(),
          participantCount: session.participants.length,
          totalQuestions: session.quiz.questions.length,
          phase,
          question: {
            questionId: currentQuestion.id,
            prompt: currentQuestion.prompt,
            options: currentQuestion.options.map(({ id, text, position }) => ({
              id,
              text,
              position,
            })),
            media: currentQuestion.imageUrl
              ? [{ type: 'image', url: currentQuestion.imageUrl, alt: currentQuestion.prompt }]
              : [],
            questionStartedAt,
            questionEndsAt,
            questionNumber: session.currentQuestionPosition + 1,
            totalQuestions: session.quiz.questions.length,
          },
          reveal,
          stats,
          players: session.participants.map((participant, index) => ({
            id: participant.id,
            name: participant.displayName,
            score: participant.score,
            rank: index + 1,
            streak: 0,
            correctAnswers: participant.correctCount,
          })),
          clockOffset: 0,
          connected: true,
          busy: false,
        }}
      />
    </>
  );
}

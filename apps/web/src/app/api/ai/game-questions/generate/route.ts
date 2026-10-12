import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { gameQuestionRefreshInputSchema } from '@/lib/ai/game-question-refresh-contract';
import { generateFreshGameQuestions } from '@/lib/ai/game-question-refresh';
import { GameContentGenerationError } from '@/lib/ai/game-content-generation';
import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import { getCurrentSession, isSessionUserCurrent } from '@/lib/auth/session';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { consumeQuota } from '@/lib/subscription/entitlements';
import { generateUniqueActivityRoomCode } from '@/lib/quiz/room-code';

export const maxDuration = 90;
const MAX_BODY_BYTES = 65_536;

export async function POST(request: Request) {
  // App Router may use the internal upstream host in request.url.
  const expectedOrigin = new URL(process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? request.url)
    .origin;
  if (request.headers.get('origin') !== expectedOrigin)
    return NextResponse.json({ ok: false, message: 'الطلب غير مسموح.' }, { status: 403 });
  const reader = request.body?.getReader();
  if (!reader)
    return NextResponse.json({ ok: false, message: 'راجع بيانات الطلب.' }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > MAX_BODY_BYTES) {
      await reader.cancel();
      return NextResponse.json(
        { ok: false, message: 'الطلب أكبر من الحد المسموح.' },
        { status: 413 },
      );
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return NextResponse.json({ ok: false, message: 'راجع بيانات الطلب.' }, { status: 400 });
  }
  const parsed = gameQuestionRefreshInputSchema.safeParse(value);
  if (!parsed.success)
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  if (!hasDatabaseUrl())
    return NextResponse.json(
      { ok: false, message: 'خدمة الأسئلة غير متاحة حاليًا.' },
      { status: 503 },
    );
  const session = await getCurrentSession();
  if (!session?.user?.id || typeof session.user.tokenVersion !== 'number')
    return NextResponse.json(
      { ok: false, message: 'سجّل الدخول لجلب أسئلة جديدة.' },
      { status: 401 },
    );
  const prisma = getPrismaClient();
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, status: true, tokenVersion: true },
  });
  if (!isSessionUserCurrent(session.user, user) || !user || user.status !== 'ACTIVE')
    return NextResponse.json(
      { ok: false, message: 'انتهت الجلسة. سجّل الدخول مجددًا.' },
      { status: 401 },
    );
  if (process.env.XAI_DISABLED === 'true' || !process.env.XAI_API_KEY)
    return NextResponse.json(
      { ok: false, message: 'خدمة توليد الأسئلة غير متاحة حاليًا.' },
      { status: 503 },
    );
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (
    !(await checkRateLimit(`ai-game-user:${user.id}`, 3, 60_000)) ||
    !(await checkRateLimit(`ai-game-ip:${ip}`, 15, 3_600_000)) ||
    !(await checkRateLimit('ai-game-global:daily', 250, 86_400_000))
  )
    return NextResponse.json(
      { ok: false, message: 'بلغت الحد المؤقت. حاول لاحقًا.' },
      { status: 429 },
    );
  const quota = await consumeQuota(user.id, 'aiQuestionsPerMonth', user.role);
  if (!quota.ok) return NextResponse.json({ ok: false, message: quota.message }, { status: 402 });
  try {
    const questions = await generateFreshGameQuestions(parsed.data);
    const batchId = randomUUID();
    let playHref: string | undefined;
    if (parsed.data.game === 'ladder' || parsed.data.game === 'elimination-live') {
      const gameMode = parsed.data.game === 'ladder' ? ('LADDER' as const) : ('QUIZ' as const);
      const roomCode = await generateUniqueActivityRoomCode(prisma);
      const quiz = await prisma.$transaction(async (tx) => {
        // Inactive categories keep private generated packs out of the public tagged bank.
        const category = await tx.category.upsert({
          where: { name: 'أسئلة الألعاب الخاصة المولّدة' },
          update: {},
          create: { name: 'أسئلة الألعاب الخاصة المولّدة', isActive: false },
        });
        if (category.isActive) throw new Error('Private category unavailable');
        return tx.quiz.create({
          data: {
            ownerId: user.id,
            title: `أسئلة جديدة: ${parsed.data.topic}`,
            roomCode,
            gameMode,
            status: 'ACTIVE',
            isPublic: false,
            questions: {
              create: questions.map((question, position) => ({
                position,
                questionVersion: 1,
                question: {
                  create: {
                    ownerId: user.id,
                    status: 'PUBLISHED',
                    type: 'MULTIPLE_CHOICE',
                    gameTypes: [gameMode],
                    prompt: question.prompt,
                    expectedAnswer: question.answer,
                    explanation: question.explanation,
                    difficulty: question.difficulty,
                    categoryId: category.id,
                    source: 'AI_GAME_PRIVATE',
                    options: {
                      create: question.options.map((text, index) => ({
                        text,
                        position: index,
                        isCorrect: index === question.answerIndex,
                      })),
                    },
                  },
                },
              })),
            },
          },
          select: { id: true },
        });
      });
      playHref = `/games/${parsed.data.game}/host?quizId=${encodeURIComponent(quiz.id)}`;
    }
    return NextResponse.json(
      { ok: true, game: parsed.data.game, questions, batchId, playHref },
      { headers: { 'cache-control': 'no-store, max-age=0' } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof GameContentGenerationError ? error.message : 'تعذّر جلب الأسئلة الآن.',
      },
      {
        status: error instanceof GameContentGenerationError && error.code === 'CONFIG' ? 503 : 502,
      },
    );
  }
}

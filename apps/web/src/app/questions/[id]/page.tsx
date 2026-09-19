import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardLayout } from '@/components/layout';
import { QuestionEditForm } from '@/components/questions/question-edit-form';
import { QuestionBankShell } from '@/components/questions/question-bank-shell';
import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import { requireQuestionManager } from '@/lib/auth/session';

export default async function EditQuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireQuestionManager(`/questions/${id}`);

  if (!hasDatabaseUrl()) notFound();

  const [question, categories] = await Promise.all([
    getPrismaClient().question.findFirst({
      where: { id, status: { not: 'ARCHIVED' } },
      include: { options: { orderBy: { position: 'asc' } } },
    }),
    getPrismaClient().category.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ]);

  if (!question) notFound();

  return (
    <DashboardLayout title="تعديل السؤال">
      <QuestionBankShell>
        <div className="dashboard-actions">
          <Link href="/questions">العودة إلى بنك الأسئلة</Link>
        </div>
        <QuestionEditForm
          categories={categories}
          question={{
            id: question.id,
            type: question.type,
            prompt: question.prompt,
            imageUrl: question.imageUrl,
            difficulty: question.difficulty,
            categoryId: question.categoryId,
            gameTypes: question.gameTypes,
            expectedAnswer: question.expectedAnswer,
            explanation: question.explanation,
            source: question.source,
            timeLimit: question.timeLimit,
            basePoints: question.basePoints,
            options: question.options.map((option: { text: string; isCorrect: boolean }) => ({
              text: option.text,
              isCorrect: option.isCorrect,
            })),
          }}
        />
      </QuestionBankShell>
    </DashboardLayout>
  );
}

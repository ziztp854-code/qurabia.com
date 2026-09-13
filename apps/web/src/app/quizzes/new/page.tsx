import { DashboardLayout } from '@/components/layout';
import { QuizBuilder } from '@/components/quizzes/quiz-builder';
import { canManageQuestions } from '@/lib/auth/authorization';
import { requireActiveUser } from '@/lib/auth/session';
import { listQuizBuilderQuestions } from '@/app/quizzes/actions';

export default async function NewQuizPage() {
  const user = await requireActiveUser('/quizzes/new');
  const canManage = canManageQuestions(user.role);

  const initialBank = await listQuizBuilderQuestions({
    query: '',
    categoryId: '',
    difficulty: 'ALL',
    gameMode: 'QUIZ',
    page: 1,
  });

  return (
    <DashboardLayout className="command-bank-layout" title="منشئ المسابقة">
      <QuizBuilder initialBank={initialBank} canAddQuestions={canManage} />
    </DashboardLayout>
  );
}

import { canManageQuestions } from '@/lib/auth/authorization';

type PublishableQuestion = {
  status: string;
  optionCount: number;
  correctOptionCount: number;
};

export function canManageContentResource(role: unknown, resourceType: unknown): boolean {
  if (resourceType === 'Question') {
    return canManageQuestions(role);
  }
  return resourceType === 'Quiz';
}

export function areQuizQuestionsPlayable(questions: readonly PublishableQuestion[]): boolean {
  return (
    questions.length > 0 &&
    questions.every(
      (question) =>
        question.status === 'PUBLISHED' &&
        question.optionCount >= 2 &&
        question.correctOptionCount === 1,
    )
  );
}

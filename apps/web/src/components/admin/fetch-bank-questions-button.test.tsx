import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchBankQuestions: vi.fn(),
}));

vi.mock('@/app/admin/(console)/content/fetch-questions', () => ({
  fetchBankQuestions: mocks.fetchBankQuestions,
}));

import { FetchBankQuestionsButton } from './fetch-bank-questions-button';

function question(index: number) {
  return {
    id: `q-${index}`,
    prompt: `سؤال ${index}`,
    category: 'علوم',
    duration: 20,
    points: 1000,
    questionVersion: 1,
  };
}

const filters = {
  category: 'ALL',
  q: '',
  difficulty: 'ALL',
  game: 'ALL',
  time: 'ANY',
};

describe('FetchBankQuestionsButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('adds fetched questions to the quiz draft and reports the count', async () => {
    mocks.fetchBankQuestions.mockResolvedValue({
      status: 'success',
      questions: [question(1), question(2)],
    });

    render(<FetchBankQuestionsButton filters={filters} />);
    await userEvent.click(screen.getByRole('button', { name: /جلب 20 سؤال/ }));

    await waitFor(() => {
      expect(screen.getByText(/جُلب 2 سؤالًا: أُضيف 2\./)).toBeInTheDocument();
    });
    const draft = JSON.parse(localStorage.getItem('tahaddi:quiz-builder:draft:v1') ?? '{}');
    expect(draft.questions.map((q: { id: string }) => q.id)).toEqual(['q-1', 'q-2']);
  });

  it('counts questions already present in the draft without duplicating them', async () => {
    localStorage.setItem(
      'tahaddi:quiz-builder:draft:v1',
      JSON.stringify({
        version: 5,
        title: '',
        description: '',
        roundName: '',
        presentationMode: 'SEQUENTIAL',
        playerLimit: 50,
        autoLockAnswers: true,
        autoAdvance: false,
        speedScoring: true,
        visibility: 'PRIVATE',
        gameMode: 'QUIZ',
        questions: [question(1)],
      }),
    );
    mocks.fetchBankQuestions.mockResolvedValue({
      status: 'success',
      questions: [question(1), question(2)],
    });

    render(<FetchBankQuestionsButton filters={filters} />);
    await userEvent.click(screen.getByRole('button', { name: /جلب 20 سؤال/ }));

    await waitFor(() => {
      expect(screen.getByText(/1 مكرر في المسودة/)).toBeInTheDocument();
    });
    const draft = JSON.parse(localStorage.getItem('tahaddi:quiz-builder:draft:v1') ?? '{}');
    expect(draft.questions).toHaveLength(2);
  });

  it('surfaces the action error message', async () => {
    mocks.fetchBankQuestions.mockResolvedValue({
      status: 'error',
      message: 'لا توجد أسئلة منشورة مطابقة للفلاتر الحالية.',
    });

    render(<FetchBankQuestionsButton filters={filters} />);
    await userEvent.click(screen.getByRole('button', { name: /جلب 20 سؤال/ }));

    await waitFor(() => {
      expect(screen.getByText('لا توجد أسئلة منشورة مطابقة للفلاتر الحالية.')).toBeInTheDocument();
    });
  });
});

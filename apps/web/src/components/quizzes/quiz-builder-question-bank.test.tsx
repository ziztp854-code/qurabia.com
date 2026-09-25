import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QuizBuilderQuestionBank } from './quiz-builder-question-bank';

vi.mock('@/components/questions/question-editor', () => ({ QuestionEditor: () => null }));

describe('QuizBuilderQuestionBank', () => {
  it('requests the category-balanced preset only from the fetch-20 button', async () => {
    const user = userEvent.setup();
    const pickRandomQuestions = vi.fn().mockResolvedValue({ status: 'success', questions: [] });
    render(
      <QuizBuilderQuestionBank
        initialBank={{
          status: 'success',
          categories: [],
          questions: [],
          page: 1,
          pageCount: 1,
          total: 0,
        }}
        gameMode="QUIZ"
        selectedIds={new Set(['selected'])}
        canAddQuestions={false}
        pickRandomQuestions={pickRandomQuestions}
        onAdd={vi.fn()}
        onAddMany={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'جلب 20 سؤالًا' }));
    expect(pickRandomQuestions).toHaveBeenLastCalledWith(
      expect.objectContaining({ preset: 'DIVERSE_20', excludeIds: ['selected'] }),
    );
    await user.click(screen.getByRole('button', { name: 'سحب وإضافة' }));
    expect(pickRandomQuestions.mock.calls.at(-1)?.[0]).not.toHaveProperty('preset');
  });
  it('does not request more random questions than the remaining capacity', async () => {
    const user = userEvent.setup();
    const pickRandomQuestions = vi.fn();
    render(
      <QuizBuilderQuestionBank
        initialBank={{
          status: 'success',
          categories: [],
          questions: [],
          page: 1,
          pageCount: 1,
          total: 0,
        }}
        gameMode="QUIZ"
        selectedIds={new Set(Array.from({ length: 99 }, (_, index) => `q${index}`))}
        canAddQuestions={false}
        pickRandomQuestions={pickRandomQuestions}
        onAdd={vi.fn()}
        onAddMany={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'سحب وإضافة' }));
    expect(pickRandomQuestions).not.toHaveBeenCalled();
    expect(screen.getByText(/قلّل أعداد السحب/)).toBeInTheDocument();
  });
  it('warns the host when the published bank cannot fill the 20-question mix', async () => {
    const user = userEvent.setup();
    const picked = [{ id: 'one', prompt: 'سؤال متاح', category: 'علوم', duration: 20, points: 500 }];
    render(
      <QuizBuilderQuestionBank
        initialBank={{ status: 'success', categories: [], questions: [], page: 1, pageCount: 1, total: 0 }}
        gameMode="QUIZ"
        selectedIds={new Set()}
        canAddQuestions={false}
        pickRandomQuestions={vi.fn().mockResolvedValue({ status: 'success', questions: picked })}
        onAdd={vi.fn()}
        onAddMany={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'جلب 20 سؤالًا' }));
    expect(await screen.findByRole('status', { name: '' })).toHaveTextContent(/لم تتوفر أسئلة منشورة كافية/);
  });
  it('asks the assistant for the full-bank 7/7/6 mix and keeps the result for host review', async () => {
    const user = userEvent.setup();
    const picked = [
      {
        id: 'assistant-one',
        prompt: 'سؤال اختاره المساعد',
        category: 'علوم',
        duration: 20,
        points: 500,
      },
    ];
    const pickAiQuestions = vi.fn().mockResolvedValue({
      status: 'success',
      questions: picked,
      selectionSource: 'openclaw',
    });
    const onAddMany = vi.fn();
    render(
      <QuizBuilderQuestionBank
        initialBank={{
          status: 'success', categories: [], questions: [], page: 1, pageCount: 1, total: 0,
        }}
        gameMode="QUIZ"
        selectedIds={new Set(['selected'])}
        canAddQuestions={false}
        pickRandomQuestions={vi.fn()}
        pickAiQuestions={pickAiQuestions}
        onAdd={vi.fn()}
        onAddMany={onAddMany}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'اختيار بالمساعد' }));
    expect(pickAiQuestions).toHaveBeenCalledWith({
      query: '',
      categoryId: '',
      gameMode: 'QUIZ',
      counts: { EASY: 7, MEDIUM: 7, HARD: 6 },
      excludeIds: ['selected'],
      preset: 'DIVERSE_20',
    });
    await waitFor(() => expect(onAddMany).toHaveBeenCalledWith(picked));
    expect(screen.getByText(/اختار المساعد/)).toHaveTextContent(/راجع الأسئلة قبل النشر/);
  });
  it.each(['fallback', undefined])(
    'tells the host when normal selection filled in for assistant source %s',
    async (selectionSource) => {
      const user = userEvent.setup();
      render(
        <QuizBuilderQuestionBank
          initialBank={{
            status: 'success', categories: [], questions: [], page: 1, pageCount: 1, total: 0,
          }}
          gameMode="QUIZ"
          selectedIds={new Set()}
          canAddQuestions={false}
          pickAiQuestions={vi.fn().mockResolvedValue({
            status: 'success', questions: [], selectionSource,
          })}
          onAdd={vi.fn()}
          onAddMany={vi.fn()}
        />,
      );

      await user.click(screen.getByRole('button', { name: 'اختيار بالمساعد' }));
      expect(await screen.findByText(/استُخدم الاختيار العادي/)).toHaveTextContent(
        /راجع الأسئلة قبل النشر/,
      );
      expect(screen.queryByText(/اختار المساعد/)).not.toBeInTheDocument();
    },
  );
  it('lets users cancel a selected question directly from the bank', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <QuizBuilderQuestionBank
        initialBank={{
          status: 'success',
          categories: [],
          page: 1,
          pageCount: 1,
          total: 1,
          questions: [
            {
              id: 'q1',
              prompt: 'سؤال مختار',
              category: '',
              duration: 20,
              points: 1000,
              gameTypes: ['QUIZ'],
            },
          ],
        }}
        gameMode="QUIZ"
        selectedIds={new Set(['q1'])}
        canAddQuestions={false}
        onAdd={vi.fn()}
        onAddMany={vi.fn()}
        onRemove={onRemove}
      />,
    );
    await user.click(screen.getByRole('checkbox', { name: 'إخفاء الأسئلة المضافة' }));
    expect(screen.getByRole('button', { name: 'إلغاء الاختيار' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'إلغاء الاختيار' }));
    expect(onRemove).toHaveBeenCalledWith('q1');
  });
  it('loads the selected mode on mount instead of offering the initial QUIZ questions', async () => {
    const initialBank = {
      status: 'success' as const,
      categories: [],
      page: 1,
      pageCount: 1,
      total: 1,
      questions: [
        {
          id: 'quiz',
          prompt: 'سؤال غير متوافق',
          category: '',
          duration: 20,
          points: 1000,
          gameTypes: ['QUIZ' as const],
        },
      ],
    };
    const loadQuestionPage = vi.fn().mockResolvedValue({ ...initialBank, questions: [], total: 0 });
    render(
      <QuizBuilderQuestionBank
        initialBank={initialBank}
        gameMode="LADDER"
        selectedIds={new Set()}
        canAddQuestions={false}
        loadQuestionPage={loadQuestionPage}
        onAdd={vi.fn()}
        onAddMany={vi.fn()}
      />,
    );
    expect(screen.queryByText('سؤال غير متوافق')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(loadQuestionPage).toHaveBeenCalledWith(
        expect.objectContaining({ gameMode: 'LADDER', page: 1 }),
      ),
    );
  });
});

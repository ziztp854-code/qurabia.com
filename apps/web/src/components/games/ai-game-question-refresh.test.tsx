import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { AiGameQuestionRefresh } from './ai-game-question-refresh';
import { LetterGame } from '@/components/letter-game/letter-game';
import { LETTER_QUESTION_POOL } from '@/lib/letter-game/questions';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
afterEach(() => vi.unstubAllGlobals());
describe('AI game question refresh', () => {
  it('previews generated questions before applying them to the actual letter game', async () => {
    const questions = LETTER_QUESTION_POOL.map((question, index) => ({
      prompt: `سؤال جديد من الذكاء الاصطناعي ${index}: ${question.prompt}`,
      answer: question.answer,
      options: [],
      answerIndex: 0,
      category: 'ثقافة',
      explanation: 'شرح الإجابة الجديدة.',
      letter: question.letter,
      slot: (index % 25) + 1,
      difficulty: 'EASY',
    }));
    const fetch = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, game: 'letter-challenge', questions, batchId: 'batch-1' }),
      });
    vi.stubGlobal('fetch', fetch);
    render(
      <AiGameQuestionRefresh game="letter-challenge">
        <LetterGame />
      </AiGameQuestionRefresh>,
    );
    fireEvent.click(screen.getByText('جلب أسئلة جديدة بالذكاء الاصطناعي', { selector: 'summary' }));
    fireEvent.click(screen.getByRole('button', { name: 'جلب أسئلة جديدة بالذكاء الاصطناعي' }));
    await screen.findByText('50 سؤالًا جديدًا للمراجعة');
    expect(JSON.parse(fetch.mock.calls[0]![1].body).excludePrompts).toContain(
      LETTER_QUESTION_POOL[0]!.prompt,
    );
    expect(screen.queryByRole('heading', { name: questions[0]!.prompt })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'اعتماد الأسئلة وبدء جولة جديدة' }));
    fireEvent.click(screen.getByRole('button', { name: /الحرف أ، خلية متاحة/ }));
    expect(screen.getByRole('heading', { name: questions[0]!.prompt })).toBeInTheDocument();
    expect(screen.queryByText('أسد')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'تغيير السؤال' }));
    expect(screen.getByRole('heading', { name: questions[25]!.prompt })).toBeInTheDocument();
  });
  it('preserves the current game when generation fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({
          ok: false,
          json: async () => ({ ok: false, message: 'خدمة توليد الأسئلة غير متاحة حاليًا.' }),
        }),
    );
    render(
      <AiGameQuestionRefresh game="letter-challenge">
        <LetterGame />
      </AiGameQuestionRefresh>,
    );
    fireEvent.click(screen.getByRole('button', { name: /الحرف أ، خلية متاحة/ }));
    fireEvent.click(screen.getByText('جلب أسئلة جديدة بالذكاء الاصطناعي', { selector: 'summary' }));
    fireEvent.click(screen.getByRole('button', { name: 'جلب أسئلة جديدة بالذكاء الاصطناعي' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('خدمة توليد الأسئلة غير متاحة حاليًا.'),
    );
    expect(
      screen.getByRole('heading', { name: LETTER_QUESTION_POOL[0]!.prompt }),
    ).toBeInTheDocument();
  });
});

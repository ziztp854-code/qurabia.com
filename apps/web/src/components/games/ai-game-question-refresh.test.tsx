import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { AiGameQuestionRefresh } from './ai-game-question-refresh';
import { LetterGame } from '@/components/letter-game/letter-game';
import { LETTER_QUESTION_POOL } from '@/lib/letter-game/questions';

const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
afterEach(() => {
  vi.unstubAllGlobals();
  push.mockClear();
});
describe('AI game question refresh', () => {
  it('keeps the game visible while hiding the generator when access is denied', () => {
    render(
      <AiGameQuestionRefresh game="ladder" showGenerator={false}>
        <p>اللعبة متاحة</p>
      </AiGameQuestionRefresh>,
    );
    expect(screen.getByText('اللعبة متاحة')).toBeInTheDocument();
    expect(screen.queryByText('اختيار أسئلة من بنك السلم')).not.toBeInTheDocument();
  });
  it('explains all-category ladder selection without asking for a topic and announces provider use', () => {
    render(<AiGameQuestionRefresh game="ladder" showExternalTopicNotice />);
    fireEvent.click(screen.getByText('اختيار أسئلة من بنك السلم', { selector: 'summary' }));
    expect(
      screen.queryByRole('textbox', { name: 'موضوع الأسئلة الجديدة' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/من جميع تصنيفات بنك السلم/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'اختيار أسئلة من البنك' }),
    ).toHaveAccessibleDescription(
      'قد تُرسل نصوص بعض الأسئلة المنشورة إلى مزوّد الذكاء الاصطناعي للمساعدة في اختيارها.',
    );
  });
  it('still offers topic input and its privacy notice for other games', () => {
    render(<AiGameQuestionRefresh game="letter-challenge" showExternalTopicNotice />);
    fireEvent.click(screen.getByText('جلب أسئلة جديدة بالذكاء الاصطناعي', { selector: 'summary' }));
    expect(
      screen.getByRole('textbox', { name: 'موضوع الأسئلة الجديدة' }),
    ).toHaveAccessibleDescription(
      'قد يحتفظ مزوّد الذكاء الاصطناعي بموضوع الأسئلة ويستخدمه. لا تدخل بيانات شخصية.',
    );
  });
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
    const fetch = vi.fn().mockResolvedValue({
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
  it('previews a ten-question ladder bank selection', async () => {
    const questions = Array.from({ length: 10 }, (_, index) => ({
      prompt: `سؤال ثقافي مختلف رقم ${index}؟`,
      answer: 'الأول',
      options: ['الأول', 'الثاني', 'الثالث', 'الرابع'],
      answerIndex: 0,
      category: ['ثقافة', 'تاريخ', 'علوم'][index % 3],
      explanation: 'شرح الإجابة الصحيحة',
      letter: '',
      slot: index + 1,
      difficulty: index < 3 ? 'EASY' : index < 6 ? 'MEDIUM' : 'HARD',
    }));
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        game: 'ladder',
        questions,
        batchId: 'batch',
        playHref: '/games/ladder/host?quizId=pack',
      }),
    });
    vi.stubGlobal('fetch', fetch);
    render(<AiGameQuestionRefresh game="ladder" />);
    fireEvent.click(screen.getByText('اختيار أسئلة من بنك السلم', { selector: 'summary' }));
    fireEvent.click(screen.getByRole('button', { name: 'اختيار أسئلة من البنك' }));
    expect(await screen.findByText('10 سؤالًا جديدًا للمراجعة')).toBeInTheDocument();
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({
      game: 'ladder',
      topic: 'ثقافة عامة',
      excludePrompts: [],
    });
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'اعتماد الأسئلة لغرفة جديدة' }));
    expect(push).toHaveBeenCalledWith('/games/ladder/host?quizId=pack');
  });
  it('preserves the current game when generation fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
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

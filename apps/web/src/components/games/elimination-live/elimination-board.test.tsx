import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EliminationBoard } from './elimination-board';

const question = {
  id: 'q1',
  prompt: 'كم عدد سور القرآن الكريم؟',
  options: ['100 سورة', '114 سورة', '120 سورة', '99 سورة'],
  difficulty: 'EASY' as const,
  roundNumber: 1,
  timeLimit: 20,
};

describe('EliminationBoard', () => {
  it('يعرض السؤال والخيارات الأربعة', () => {
    render(
      <EliminationBoard
        question={question}
        myAnswer={null}
        revealedCorrectIndex={null}
        aliveCount={32}
        roundLabel="الجولة 1 من 5"
        timeLabel="0:20"
        disabled={false}
        onSelectOption={vi.fn()}
      />,
    );

    expect(screen.getByText(question.prompt)).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(4);
    expect(screen.getByText('114 سورة')).toBeInTheDocument();
  });

  it('يستدعي onSelectOption عند اختيار خيار', async () => {
    const user = userEvent.setup();
    const onSelectOption = vi.fn();
    render(
      <EliminationBoard
        question={question}
        myAnswer={null}
        revealedCorrectIndex={null}
        aliveCount={32}
        roundLabel="الجولة 1 من 5"
        timeLabel="0:20"
        disabled={false}
        onSelectOption={onSelectOption}
      />,
    );

    await user.click(screen.getByRole('button', { name: /114 سورة/ }));
    expect(onSelectOption).toHaveBeenCalledWith(1);
  });

  it('يعطّل الخيارات بعد قيد إجابة اللاعب', () => {
    render(
      <EliminationBoard
        question={question}
        myAnswer={1}
        revealedCorrectIndex={null}
        aliveCount={24}
        roundLabel="الجولة 1 من 5"
        timeLabel="0:12"
        disabled={true}
        onSelectOption={vi.fn()}
      />,
    );

    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
    expect(screen.getByText(/قُيّدت إجابتك/)).toBeInTheDocument();
  });

  it('يكشف الإجابة الصحيحة بعد حسم الجولة', () => {
    render(
      <EliminationBoard
        question={question}
        myAnswer={0}
        revealedCorrectIndex={1}
        aliveCount={24}
        roundLabel="الجولة 1 من 5"
        timeLabel="0:00"
        disabled={true}
        onSelectOption={vi.fn()}
      />,
    );

    const correct = screen.getByRole('button', { name: /114 سورة/ });
    expect(correct.className).toContain('is-correct');
    const mine = screen.getByRole('button', { name: /100 سورة/ });
    expect(mine.className).toContain('is-wrong');
  });
});

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { LetterGame } from './letter-game';

describe('LetterGame', () => {
  it('uses the questions supplied by the database-backed game page', async () => {
    const user = userEvent.setup();
    render(
      <LetterGame
        questions={[
          {
            id: 'bank-alif',
            letter: 'أ',
            prompt: 'سؤال قادم من بنك تحدي الحروف ويبدأ جوابه بحرف الألف؟',
            answer: 'أبجدية',
            category: 'objects',
            pattern: 'definition',
          },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /الحرف أ، خلية متاحة/ }));

    expect(screen.getByText('سؤال قادم من بنك تحدي الحروف ويبدأ جوابه بحرف الألف؟')).toBeInTheDocument();
  });

  it('renders the two teams, the board, and the mobile history control', () => {
    render(<LetterGame />);

    expect(screen.getByRole('heading', { name: 'تحدي الحروف' })).toBeInTheDocument();
    expect(screen.getByText('الفريق الأخضر')).toBeInTheDocument();
    expect(screen.getByText('الفريق البرتقالي')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'شبكة حروف تحدي الحروف' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'فتح سجل اللعب' })).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /خلية متاحة/ }).filter((cell) => cell.tabIndex === 0),
    ).toHaveLength(1);
  });

  it('opens a question, hides the answer while the timer is running, and awards the cell on correct', async () => {
    const user = userEvent.setup();
    render(<LetterGame />);

    await user.click(screen.getByRole('button', { name: /الحرف أ، خلية متاحة/ }));
    expect(screen.getByText(/السافانا الأفريقية/)).toBeInTheDocument();
    // The answer must NOT be revealed while the timer is still running.
    expect(screen.queryByText('الإجابة: أسد')).not.toBeInTheDocument();
    expect(screen.getByText('الإجابة محجوبة')).toBeInTheDocument();
    expect(screen.getByText('ستظهر الإجابة تلقائياً عند انتهاء العدّ التنازلي')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /انتظر حكم السؤال الحالي/ })[0]).toBeDisabled();
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute('id', 'letter-question-panel'),
    );

    await user.click(screen.getByRole('button', { name: 'إجابة صحيحة' }));
    expect(screen.getByRole('button', { name: /الحرف أ، يملكها الفريق الأخضر/ })).toBeDisabled();
    expect(screen.getByText('دور الفريق البرتقالي')).toBeInTheDocument();
    // The question panel returns to the empty state once the round is judged.
    expect(screen.getByText('السؤال سيظهر هنا')).toBeInTheDocument();
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute('id', 'letter-turn-indicator'),
    );
  });

  it('moves the roving focus through the RTL board with arrow keys', async () => {
    const user = userEvent.setup();
    render(<LetterGame />);
    const firstCell = screen.getByRole('button', { name: /الحرف أ، خلية متاحة/ });

    firstCell.focus();
    await user.keyboard('{ArrowLeft}');

    expect(document.activeElement).toHaveAttribute('data-letter-cell', '0:1');
    expect(document.activeElement).toHaveAccessibleName(/الحرف ب، خلية متاحة/);
  });

  it('traps focus in the mobile history dialog and restores it after Escape', async () => {
    const user = userEvent.setup();
    render(<LetterGame />);
    const trigger = screen.getByRole('button', { name: 'فتح سجل اللعب' });

    await user.click(trigger);
    const close = screen.getByRole('button', { name: 'إغلاق سجل اللعب' });
    await waitFor(() => expect(close).toHaveFocus());
    expect(screen.getByRole('dialog', { name: 'سجل اللعب' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'سجل اللعب' })).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('moves focus to the first available cell after starting a new round', async () => {
    const user = userEvent.setup();
    render(<LetterGame />);

    await user.click(screen.getByRole('button', { name: 'بدء جولة جديدة' }));
    await waitFor(() => expect(document.activeElement).toHaveAccessibleName(/الحرف أ، خلية متاحة/));
  });
});

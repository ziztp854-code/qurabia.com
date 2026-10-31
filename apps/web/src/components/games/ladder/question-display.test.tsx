import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LadderQuestion } from '@tahaddi/domain';
import { describe, expect, it, vi } from 'vitest';
import { QuestionDisplay } from './question-display';

const question = (optionCount: 2 | 4): LadderQuestion => ({
  id: `question-${optionCount}`,
  roomId: 'AB12CD34',
  questionText: 'ما الإجابة الصحيحة؟',
  options: Array.from({ length: optionCount }, (_, index) => ({
    id: `option-${index + 1}`,
    text: `الخيار ${index + 1}`,
  })),
  category: { id: 'science', name: 'علوم' },
  difficulty: 'EASY',
  timeLimit: 20,
  roundNumber: 1,
  createdAt: 1_800_000_000_000,
});

describe('QuestionDisplay', () => {
  it.each([2, 4] as const)('renders and submits a %s-option question', async (optionCount) => {
    const onAnswer = vi.fn();
    const user = userEvent.setup();
    render(
      <QuestionDisplay
        question={question(optionCount)}
        timeLimit={20}
        roundNumber={1}
        totalRounds={10}
        onAnswer={onAnswer}
        selectedOption={null}
        disabled={false}
      />,
    );

    const options = screen.getAllByRole('button');
    expect(options).toHaveLength(optionCount);

    await user.click(options[0]);

    expect(onAnswer).toHaveBeenCalledWith('option-1');
    expect(screen.queryByText('تم إرسال الإجابة.')).not.toBeInTheDocument();
    expect(screen.queryByText(/الإجابة الصحيحة:/)).not.toBeInTheDocument();
  });
  it('keeps the server deadline and answer selection across room updates', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    const onAnswer = vi.fn();
    const current = question(4);
    const view = render(
      <QuestionDisplay question={current} timeLimit={20} roundNumber={1} totalRounds={20}
        onAnswer={onAnswer} selectedOption={null} disabled={false} />,
    );
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(onAnswer).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(5_000); });
    view.rerender(
      <QuestionDisplay question={current} timeLimit={15} roundNumber={1} totalRounds={20}
        onAnswer={onAnswer} selectedOption="option-1" disabled={false} />,
    );
    expect(screen.getByRole('timer')).toHaveTextContent('15');
    expect(screen.getAllByRole('button')[0]).toHaveAttribute('aria-pressed', 'true');
    act(() => { vi.advanceTimersByTime(15_000); });
    expect(screen.getByRole('timer')).toHaveTextContent('0');
    expect(screen.getAllByRole('button').every((button) => button.hasAttribute('disabled'))).toBe(true);
    vi.useRealTimers();
  });

  it('locks unanswered options when the server deadline is reached', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    const onAnswer = vi.fn();
    render(<QuestionDisplay question={question(4)}
      timeLimit={2} roundNumber={1} totalRounds={20} onAnswer={onAnswer}
      selectedOption={null} disabled={false} />);
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(screen.getAllByRole('button').every((button) => button.hasAttribute('disabled'))).toBe(true);
    expect(onAnswer).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('uses remaining time even if the device clock is far ahead', () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000_000_000_000);
    render(<QuestionDisplay question={question(4)}
      timeLimit={5} roundNumber={1} totalRounds={20}
      onAnswer={vi.fn()} selectedOption={null} disabled={false} />);
    expect(screen.getAllByRole('button')[0]).toBeEnabled();
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(screen.getAllByRole('button')[0]).toBeDisabled();
    vi.useRealTimers();
  });


  it('waits for the server to confirm an answer before locking it', async () => {
    const onAnswer = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<QuestionDisplay question={question(2)} timeLimit={20} roundNumber={1} totalRounds={10} onAnswer={onAnswer} selectedOption={null} disabled={false} />);
    await user.click(screen.getAllByRole('button')[0]);
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('button')[0]).toBeEnabled();
    rerender(<QuestionDisplay question={question(2)} timeLimit={20} roundNumber={1} totalRounds={10} onAnswer={onAnswer} selectedOption="option-1" disabled={false} />);
    expect(screen.getAllByRole('button')[0]).toBeDisabled();
    expect(screen.getByText('تم إرسال الإجابة.')).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
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
    expect(screen.getByText('تم إرسال الإجابة.')).toBeInTheDocument();
    expect(screen.queryByText(/الإجابة الصحيحة:/)).not.toBeInTheDocument();
  });
});

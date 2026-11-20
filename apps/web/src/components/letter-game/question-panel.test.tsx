import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QuestionPanel } from './question-panel';
import type { LetterQuestion } from '@/lib/letter-game/types';

const question: LetterQuestion = {
  id: 'q-1',
  letter: 'ش',
  prompt: 'ما أقرب نجم إلى الأرض؟',
  answer: 'شمس',
  category: 'space',
  pattern: 'definition',
};

describe('QuestionPanel answer reveal', () => {
  it('reveals the answer only when requested and leaves the judgment to the host', async () => {
    const user = userEvent.setup();
    const onJudge = vi.fn();
    render(<QuestionPanel question={question} onJudge={onJudge} onReplace={vi.fn()} canReplace />);

    const reveal = screen.getByRole('button', { name: 'كشف الجواب', pressed: false });
    expect(screen.queryByText('شمس')).not.toBeInTheDocument();
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    await user.click(reveal);
    expect(screen.getByRole('status')).toHaveTextContent('شمس');
    expect(reveal).toHaveAttribute('aria-pressed', 'true');
    expect(reveal).toHaveFocus();
    expect(onJudge).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'إجابة صحيحة' }));
    expect(onJudge).toHaveBeenCalledWith('correct');
  });

  it('only offers replacement when there is another question', () => {
    render(
      <QuestionPanel
        question={question}
        onJudge={vi.fn()}
        onReplace={vi.fn()}
        canReplace={false}
      />,
    );
    expect(screen.queryByRole('button', { name: 'تغيير السؤال' })).not.toBeInTheDocument();
  });
});

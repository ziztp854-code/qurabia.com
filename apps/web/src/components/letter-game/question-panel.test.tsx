import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QuestionPanel } from './question-panel';
import type { LetterQuestion } from '@/lib/letter-game/types';

const sampleQuestion: LetterQuestion = {
  id: 'q-1',
  letter: 'أ',
  prompt: 'في السافانا الأفريقية، أيُّ حيوانٍ يتربّع على عرشها بلا منازع، وتخشاه كلُّ الوحوش؟',
  answer: 'أسد',
  category: 'animals',
  pattern: 'scenario',
};

describe('QuestionPanel answer reveal', () => {
  it('hides the answer while the timer is still running and shows the masked placeholder', () => {
    render(
      <QuestionPanel
        question={sampleQuestion}
        timer={12}
        team="green"
        feedback={null}
        onJudge={vi.fn()}
      />,
    );

    // The answer text must not leak while the timer is still ticking.
    expect(screen.queryByText('الإجابة: أسد')).not.toBeInTheDocument();
    expect(screen.getByText('الإجابة محجوبة')).toBeInTheDocument();
    expect(screen.getByText('؟؟؟')).toBeInTheDocument();
    expect(
      screen.getByText('ستظهر الإجابة تلقائياً عند انتهاء العدّ التنازلي'),
    ).toBeInTheDocument();
    // The reveal badge must not be shown yet.
    expect(screen.queryByText('تم الكشف')).not.toBeInTheDocument();
    // Timer must NOT be in danger state above the 10s threshold.
    expect(screen.getByRole('timer').getAttribute('data-low')).toBeNull();
  });

  it('marks the timer as low-time when 10 seconds or fewer remain', () => {
    render(
      <QuestionPanel
        question={sampleQuestion}
        timer={7}
        team="green"
        feedback={null}
        onJudge={vi.fn()}
      />,
    );

    expect(screen.getByRole('timer').getAttribute('data-low')).toBe('true');
    expect(screen.queryByText('الإجابة: أسد')).not.toBeInTheDocument();
  });

  it('lets the host reveal the answer before judging it', async () => {
    const user = userEvent.setup();

    render(
      <QuestionPanel
        question={sampleQuestion}
        timer={12}
        team="green"
        feedback={null}
        onJudge={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'إظهار الإجابة للمضيف' }));

    expect(screen.getByText('أسد')).toBeInTheDocument();
    expect(screen.getByText('تم الكشف')).toBeInTheDocument();
    expect(screen.queryByText('الإجابة محجوبة')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إجابة صحيحة' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'إجابة خاطئة' })).toBeEnabled();
  });

  it('reveals the answer once the timer reaches zero', () => {
    render(
      <QuestionPanel
        question={sampleQuestion}
        timer={0}
        team="green"
        feedback={null}
        onJudge={vi.fn()}
      />,
    );

    expect(screen.getByText('أسد')).toBeInTheDocument();
    expect(screen.getByText('تم الكشف')).toBeInTheDocument();
    expect(screen.getByRole('timer').getAttribute('data-elapsed')).toBe('true');
  });

  it('reveals the answer immediately when the host has already judged the round', () => {
    render(
      <QuestionPanel
        question={sampleQuestion}
        timer={9}
        team="green"
        feedback="correct"
        onJudge={vi.fn()}
      />,
    );

    expect(screen.getByText('أسد')).toBeInTheDocument();
    expect(screen.getByText('تم الكشف')).toBeInTheDocument();
  });
});

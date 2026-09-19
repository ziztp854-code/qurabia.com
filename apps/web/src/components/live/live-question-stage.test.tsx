import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LiveCountdown, LiveQuestionStage } from './live-question-stage';

const question = {
  questionId: 'question-1',
  prompt: 'اختر الإجابة الصحيحة',
  options: [
    { id: 'a', text: 'الخيار الأول', position: 0 },
    { id: 'b', text: 'الخيار الثاني', position: 1 },
    { id: 'c', text: 'الخيار الثالث', position: 2 },
    { id: 'd', text: 'الخيار الرابع', position: 3 },
  ],
  media: [],
  questionStartedAt: Date.now(),
  questionEndsAt: Date.now() + 20_000,
  questionNumber: 1,
  totalQuestions: 4,
};

describe('LiveQuestionStage', () => {
  it('keeps the server-rendered countdown independent from the local clock', () => {
    const now = vi.spyOn(Date, 'now');
    renderToString(
      <LiveCountdown
        question={{ ...question, questionStartedAt:1_000, questionEndsAt:21_000 }}
        clockOffset={0}
      />,
    );

    expect(now).not.toHaveBeenCalled();
    now.mockRestore();
  });

  it('settles an expired countdown at zero', () => {
    render(
      <LiveCountdown
        question={{ ...question, questionStartedAt: Date.now() - 20_000, questionEndsAt: Date.now() - 1 }}
        clockOffset={0}
      />,
    );

    expect(screen.getByRole('timer', { name: 'متبقي 0 ثانية' })).toBeVisible();
  });

  it('renders accessible touch answers without revealing correctness during QUESTION', () => {
    const { container } = render(
      <LiveQuestionStage
        question={question}
        phase="QUESTION"
        reveal={null}
        stats={null}
        clockOffset={0}
        onSelect={() => undefined}
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(4);
    expect(screen.getByRole('button', { name: /الخيار أ: الخيار الأول/ })).toBeEnabled();
    expect(
      [...container.querySelectorAll('.royal-answer-number')].map((option) => option.textContent),
    ).toEqual(['أ', 'ب', 'ج', 'د']);
    expect(screen.queryByLabelText('صحيحة')).not.toBeInTheDocument();
    expect(container.querySelector('.royal-question-media')).not.toBeInTheDocument();
    expect(container.querySelector('[class*="live-"], [class*="cinematic-"]')).toBeNull();
  });

  it('shows the host-only correct answer without exposing it to ordinary players', () => {
    const { rerender } = render(
      <LiveQuestionStage
        question={question}
        phase="QUESTION"
        reveal={null}
        stats={null}
        clockOffset={0}
        hostCorrectOptionId="b"
      />,
    );

    expect(screen.getByRole('button', { name: /الخيار ب: الخيار الثاني/ })).toHaveClass(
      'is-host-correct',
    );

    rerender(
      <LiveQuestionStage
        question={question}
        phase="QUESTION"
        reveal={null}
        stats={null}
        clockOffset={0}
      />,
    );
    expect(screen.getByRole('button', { name: /الخيار ب: الخيار الثاني/ })).not.toHaveClass(
      'is-host-correct',
    );
  });

  it('keeps the four answer positions and shows reveal marks and percentages', () => {
    const { container } = render(
      <LiveQuestionStage
        question={question}
        phase="REVEAL"
        reveal={{
          questionId: 'question-1',
          correctOptionId: 'b',
          explanation: null,
          stats: {
            questionId: 'question-1',
            answeredCount: 3,
            participantCount: 3,
            options: [
              { optionId: 'a', count: 1, percentage: 33 },
              { optionId: 'b', count: 2, percentage: 67 },
              { optionId: 'c', count: 0, percentage: 0 },
              { optionId: 'd', count: 0, percentage: 0 },
            ],
          },
        }}
        stats={{
          questionId: 'question-1',
          answeredCount: 3,
          participantCount: 3,
          options: [
            { optionId: 'a', count: 1, percentage: 33 },
            { optionId: 'b', count: 2, percentage: 67 },
            { optionId: 'c', count: 0, percentage: 0 },
            { optionId: 'd', count: 0, percentage: 0 },
          ],
        }}
        clockOffset={0}
      />,
    );
    expect(container.querySelectorAll('.royal-answer-option')).toHaveLength(4);
    expect(container.querySelectorAll('.royal-answer-share')).toHaveLength(4);
    expect(screen.getByLabelText('صحيحة')).toBeInTheDocument();
    expect(screen.getAllByLabelText('خاطئة')).toHaveLength(3);
    expect(screen.getByText(/2 · 67٪/)).toBeInTheDocument();
  });

  it('reserves four stable slots for two-option questions', () => {
    const { container } = render(
      <LiveQuestionStage
        question={{ ...question, options: question.options.slice(0, 2) }}
        phase="QUESTION"
        reveal={null}
        stats={null}
        clockOffset={0}
        onSelect={() => undefined}
      />,
    );
    expect(container.querySelectorAll('.royal-answer-option')).toHaveLength(2);
    expect(container.querySelectorAll('.royal-answer-placeholder')).toHaveLength(2);
  });
});

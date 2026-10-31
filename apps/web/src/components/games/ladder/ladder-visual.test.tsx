import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LadderVisual } from './ladder-visual';

describe('LadderVisual', () => {
  it('renders the active question in the center between both ladders', () => {
    render(
      <LadderVisual
        rightPosition={2}
        leftPosition={1}
        winningPosition={5}
        currentRound={2}
        totalRounds={5}
      >
        <section data-testid="question-between-ladders">السؤال الحالي</section>
      </LadderVisual>,
    );

    const center = screen.getByTestId('ladder-question-center');
    expect(center).toContainElement(screen.getByTestId('question-between-ladders'));
  });
  it('lights only each contestant’s current position and reports the score', () => {
    const { container, rerender } = render(<LadderVisual rightPosition={2} leftPosition={1}
      rightName="خالد" leftName="فهد" rightScore={7000} leftScore={6000}
      winningPosition={10} currentRound={1} totalRounds={10} />);
    expect(screen.getByLabelText(/خالد، الدرجة/)).toBeInTheDocument();
    expect(screen.getByLabelText(/فهد، الدرجة/)).toBeInTheDocument();
    expect(container.querySelectorAll('[data-current="true"]')).toHaveLength(2);
    rerender(<LadderVisual rightPosition={3} leftPosition={0}
      winningPosition={10} currentRound={2} totalRounds={10} />);
    expect(container.querySelectorAll('[data-current="true"]')).toHaveLength(2);
  });
  it('announces the winner and the deciding rule inside the stage', () => {
    render(<LadderVisual rightPosition={10} leftPosition={10} winningPosition={10} currentRound={10} totalRounds={10}
      finale={{ title: 'يفوز خالد', detail: '٧٠٠٠ مقابل ٦٠٠٠ نقطة', reason: 'الحسم بأعلى مجموع نقاط' }} />);
    const center = screen.getByTestId('ladder-question-center');
    expect(center).toHaveTextContent('يفوز خالد');
    expect(center).toHaveTextContent('الحسم بأعلى مجموع نقاط');
  });
});

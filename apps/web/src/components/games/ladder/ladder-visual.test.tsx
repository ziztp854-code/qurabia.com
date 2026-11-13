import { fireEvent, render, screen, within } from '@testing-library/react';
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

  it('shows the crown only for the winning side and never for a draw', () => {
    const finale = { title: 'يفوز خالد', detail: '٧٠٠٠ - ٦٠٠٠ نقطة', reason: 'الحسم بالنقاط' };
    const { rerender } = render(<LadderVisual rightPosition={4} leftPosition={3}
      rightName="خالد" leftName="فهد" rightScore={7000} leftScore={6000}
      winningPosition={10} currentRound={10} totalRounds={10}
      finale={{ ...finale, winnerSide: 'right' }} />);
    expect(screen.getByTestId('ladder-winner-crown')).toHaveAttribute('data-side', 'right');
    expect(screen.getByLabelText(/خالد، الدرجة/)).toHaveTextContent('خالد');
    rerender(<LadderVisual rightPosition={2} leftPosition={5}
      rightName="خالد" leftName="عبدالعزيز بن سلطان آل العتيبيي" rightScore={4000} leftScore={8000}
      winningPosition={10} currentRound={10} totalRounds={10}
      finale={{ title: 'يفوز عبدالعزيز بن سلطان آل العتيبيي', detail: '٤٠٠٠ - ٨٠٠٠ نقطة', reason: 'الحسم بالدرجة', winnerSide: 'left' }} />);
    expect(screen.getByTestId('ladder-winner-crown')).toHaveAttribute('data-side', 'left');
    expect(screen.getByText('عبدالعزيز بن سلطان آل العتيبيي')).toHaveAttribute('data-long', 'true');
    rerender(<LadderVisual rightPosition={4} leftPosition={4}
      rightName="خالد" leftName="فهد" rightScore={7000} leftScore={7000}
      winningPosition={10} currentRound={10} totalRounds={10}
      finale={{ title: 'تعادل', detail: '٧٠٠٠ - ٧٠٠٠ نقطة', reason: '' }} />);
    expect(screen.queryByTestId('ladder-winner-crown')).not.toBeInTheDocument();
  });

  it('shows the actual winning score and lets players reveal the match details', () => {
    render(<LadderVisual rightPosition={4} leftPosition={3} rightScore={7000} leftScore={6000}
      winningPosition={10} currentRound={10} totalRounds={10}
      finale={{ title: 'يفوز خالد', detail: '٧٠٠٠ - ٦٠٠٠ نقطة', reason: 'الحسم بالنقاط', winnerSide: 'right' }} />);
    const scene = screen.getByTestId('winner-celebration');
    expect(scene).toHaveTextContent('يفوز خالد');
    expect(scene).toHaveTextContent('7,000');
    fireEvent.click(within(scene).getByRole('button', { name: 'عرض تفاصيل المباراة' }));
    expect(screen.queryByTestId('winner-celebration')).not.toBeInTheDocument();
    expect(screen.getByTestId('ladder-question-center')).toHaveTextContent('الحسم بالنقاط');
  });
});

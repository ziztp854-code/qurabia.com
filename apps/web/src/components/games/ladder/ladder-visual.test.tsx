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
  it('shows each team marker at its server-provided position', () => {
    const { rerender } = render(<LadderVisual rightPosition={2} leftPosition={1}
      winningPosition={10} currentRound={1} totalRounds={20} />);
    expect(screen.getByRole('img', { name: 'موقع فريق اليمين: 2' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'موقع فريق اليسار: 1' })).toBeInTheDocument();
    rerender(<LadderVisual rightPosition={3} leftPosition={0}
      winningPosition={10} currentRound={2} totalRounds={20} />);
    expect(screen.getByRole('img', { name: 'موقع فريق اليمين: 3' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'موقع فريق اليسار: 0' })).toBeInTheDocument();
  });

});

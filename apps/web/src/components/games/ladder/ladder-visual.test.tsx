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
});

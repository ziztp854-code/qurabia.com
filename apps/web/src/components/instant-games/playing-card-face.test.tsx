import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PlayingCardFace } from './playing-card-face';

describe('PlayingCardFace', () => {
  it('isolates the face from page RTL so a 10 stays 10', () => {
    const { container } = render(
      <div dir="rtl">
        <PlayingCardFace card={{ rank: '10', suit: 'hearts' }} />
      </div>,
    );

    const svg = container.querySelector('svg');
    expect(container.querySelector('span[dir="ltr"]')).not.toBeNull();
    expect(svg).toHaveAttribute('direction', 'ltr');
    expect(svg).toHaveAttribute('data-rank', '10');
    expect(svg).toHaveAttribute('data-suit', 'hearts');
    expect([...container.querySelectorAll('text')].map((node) => node.textContent)).toEqual([
      '10',
      '10',
    ]);
  });

  it('inverts the lower-half pips on a 10 so the card reads from both ends', () => {
    const { container } = render(<PlayingCardFace card={{ rank: '10', suit: 'hearts' }} />);
    expect(container.querySelectorAll('[data-pip-flip]')).toHaveLength(5);
  });

  it('draws a mirrored court panel for face cards', () => {
    const { container } = render(<PlayingCardFace card={{ rank: 'K', suit: 'diamonds' }} />);
    expect(container.querySelector('[data-court]')).not.toBeNull();
    expect(container.querySelector('svg')).toHaveAttribute('data-red');
  });
});

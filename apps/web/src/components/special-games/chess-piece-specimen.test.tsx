import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChessPieceSpecimen } from './chess-piece-specimen';

const EXPECTED_SIZES = [18, 20, 24, 26, 32, 40, 48, 64, 96];

describe('ChessPieceSpecimen', () => {
  it('renders every classic piece and color at every real product size', () => {
    const { container } = render(<ChessPieceSpecimen />);
    const sizeSamples = Array.from(
      container.querySelectorAll<HTMLElement>('.chess-piece-specimen__size-art'),
    );

    expect(sizeSamples).toHaveLength(6 * 2 * 2 * EXPECTED_SIZES.length);

    for (const size of EXPECTED_SIZES) {
      const samplesAtSize = sizeSamples.filter((sample) => sample.dataset.size === String(size));
      expect(samplesAtSize).toHaveLength(24);
      expect(new Set(samplesAtSize.map((sample) => sample.dataset.color))).toEqual(
        new Set(['white', 'black']),
      );
      expect(new Set(samplesAtSize.map((sample) => sample.dataset.background))).toEqual(
        new Set(['light', 'dark']),
      );
    }

    expect(new Set(sizeSamples.map((sample) => sample.dataset.piece))).toEqual(
      new Set(['K', 'Q', 'R', 'B', 'N', 'P']),
    );
  });

  it('shows the shared numeric family specification in the specimen', () => {
    render(<ChessPieceSpecimen />);

    expect(screen.getByText('WebP / Next Image')).toBeInTheDocument();
    expect(screen.getByText('18–96px')).toBeInTheDocument();
    expect(screen.getByText('y=94')).toBeInTheDocument();
  });

  it('keeps each mobile matrix value associated with a visible text label', () => {
    const { container } = render(<ChessPieceSpecimen />);
    const cells = Array.from(
      container.querySelectorAll<HTMLElement>('.chess-piece-specimen__cell'),
    );

    expect(cells).toHaveLength(24);
    for (const cell of cells) {
      expect(cell.dataset.label).toBeTruthy();
    }
    expect(screen.getByRole('table')).toHaveClass('chess-piece-specimen__table');
  });
});

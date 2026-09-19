import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHESS_PIECE_DESIGN_SPEC, ChessPieceSvg, getPieceLabel } from './chess-piece';
import { ChessPieceSpecimen } from './chess-piece-specimen';

const TYPES = [
  ['K', 'king', 'الملك'],
  ['Q', 'queen', 'الملكة'],
  ['R', 'rook', 'الرخ'],
  ['B', 'bishop', 'الفيل'],
  ['N', 'knight', 'الحصان'],
  ['P', 'pawn', 'الجندي'],
] as const;

describe('ChessPieceSvg', () => {
  it('ships every production WebP at 768px with a real alpha channel', () => {
    for (const color of ['white', 'black'] as const) {
      for (const [, filename] of TYPES) {
        const asset = readFileSync(
          resolve(process.cwd(), 'public', 'chess', 'pieces', `${color}-${filename}.webp`),
        );
        const width = asset.readUIntLE(24, 3) + 1;
        const height = asset.readUIntLE(27, 3) + 1;

        expect(asset.toString('ascii', 0, 4)).toBe('RIFF');
        expect(asset.toString('ascii', 8, 12)).toBe('WEBP');
        expect(asset.toString('ascii', 12, 16)).toBe('VP8X');
        expect(asset[20] & 0x10).toBe(0x10);
        expect([width, height]).toEqual([768, 768]);
      }
    }
  });

  it('renders the full family from independent production assets without SVG fallback', () => {
    for (const color of ['white', 'black'] as const) {
      for (const [piece, filename, label] of TYPES) {
        const { container, unmount } = render(<ChessPieceSvg piece={piece} color={color} />);
        const image = screen.getByRole('img', {
          name: `${label} ${color === 'white' ? 'الأبيض' : 'الأسود'}`,
        });
        const model = image.closest('[data-piece]');

        expect(decodeURIComponent(image.getAttribute('src') ?? '')).toContain(
          `/chess/pieces/${color}-${filename}.webp`,
        );
        expect(model).toHaveAttribute('data-renderer', 'next-image');
        expect(model).toHaveAttribute('data-style', 'reference-luxury');
        expect(container.querySelector('svg')).toBeNull();
        unmount();
      }
    }
  });

  it('keeps both approved knight files as the production knight assets', () => {
    for (const color of ['white', 'black'] as const) {
      const { unmount } = render(<ChessPieceSvg piece="N" color={color} />);
      const image = screen.getByRole('img', {
        name: `الحصان ${color === 'white' ? 'الأبيض' : 'الأسود'}`,
      });

      expect(decodeURIComponent(image.getAttribute('src') ?? '')).toContain(
        `/chess/pieces/${color}-knight.webp`,
      );
      unmount();
    }
  });

  it('uses one baseline and an independent visual scale for every type', () => {
    const scales = new Set<number>();

    for (const [piece] of TYPES) {
      const { container, unmount } = render(<ChessPieceSvg piece={piece} color="white" />);
      const model = container.querySelector('.chess-piece-model');
      const metrics = CHESS_PIECE_DESIGN_SPEC.pieces[piece];

      expect(model).toHaveAttribute('data-baseline', String(CHESS_PIECE_DESIGN_SPEC.baseline));
      expect(model).toHaveAttribute('data-scale', String(metrics.scale));
      expect(model).toHaveStyle({ '--chess-piece-scale': String(metrics.scale) });
      scales.add(metrics.scale);
      unmount();
    }

    expect(scales.size).toBeGreaterThan(3);
    expect(CHESS_PIECE_DESIGN_SPEC.pieces.K.scale).toBeGreaterThan(
      CHESS_PIECE_DESIGN_SPEC.pieces.Q.scale,
    );
    expect(CHESS_PIECE_DESIGN_SPEC.pieces.P.scale).toBeLessThan(
      CHESS_PIECE_DESIGN_SPEC.pieces.R.scale,
    );
  });

  it('preserves material metadata and the caller class', () => {
    const { container } = render(
      <>
        <ChessPieceSvg piece="Q" color="white" className="custom-piece" />
        <ChessPieceSvg piece="q" color="black" />
      </>,
    );
    const white = container.querySelector('[data-color="white"]');
    const black = container.querySelector('[data-color="black"]');

    expect(white).toHaveAttribute('data-palette', 'ivory');
    expect(black).toHaveAttribute('data-palette', 'onyx');
    expect(white).toHaveAttribute('data-accent', 'gold');
    expect(black).toHaveAttribute('data-accent', 'gold');
    expect(white).toHaveClass('custom-piece');
  });

  it('can be decorative when the surrounding control already provides its name', () => {
    const { container } = render(<ChessPieceSvg piece="K" color="white" decorative />);
    const model = container.querySelector('.chess-piece-model');
    const image = container.querySelector('img');

    expect(model).toHaveAttribute('aria-hidden', 'true');
    expect(image).toHaveAttribute('alt', '');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('renders nothing for an unknown piece', () => {
    const { container } = render(<ChessPieceSvg piece="?" color="white" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('labels Arabic piece names from FEN characters', () => {
    expect(
      Object.fromEntries(
        ['K', 'Q', 'R', 'B', 'N', 'P', 'k', 'q', 'r', 'b', 'n', 'p'].map((piece) => [
          piece,
          getPieceLabel(piece),
        ]),
      ),
    ).toEqual({
      K: 'أبيض الملك',
      Q: 'أبيض الملكة',
      R: 'أبيض الرخ',
      B: 'أبيض الفيل',
      N: 'أبيض الحصان',
      P: 'أبيض الجندي',
      k: 'أسود الملك',
      q: 'أسود الملكة',
      r: 'أسود الرخ',
      b: 'أسود الفيل',
      n: 'أسود الحصان',
      p: 'أسود الجندي',
    });
  });

  it('keeps the specimen baseline copy aligned with the implemented baseline', () => {
    render(<ChessPieceSpecimen />);
    expect(screen.getByText(/محاذية على y=94/)).toBeInTheDocument();
  });
});

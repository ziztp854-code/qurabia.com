'use client';

import Image from 'next/image';
import type { CSSProperties } from 'react';

type PieceType = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P';
type ChessColor = 'white' | 'black';

const PIECE_ASSETS: Record<PieceType, string> = {
  K: 'king',
  Q: 'queen',
  R: 'rook',
  B: 'bishop',
  N: 'knight',
  P: 'pawn',
};

const PIECE_LABELS: Record<PieceType, string> = {
  K: 'الملك',
  Q: 'الملكة',
  R: 'الرخ',
  B: 'الفيل',
  N: 'الحصان',
  P: 'الجندي',
};

export const CHESS_PIECE_DESIGN_SPEC = {
  baseline: 94,
  sizes: [18, 20, 24, 26, 32, 40, 48, 64, 96],
  pieces: {
    K: { scale: 1.05, offsetY: 0 },
    Q: { scale: 1.01, offsetY: 0 },
    R: { scale: 0.86, offsetY: 0 },
    B: { scale: 0.99, offsetY: 0 },
    N: { scale: 0.96, offsetY: 0 },
    P: { scale: 0.76, offsetY: 0 },
  },
} as const;

interface ChessPieceSvgProps {
  piece: string;
  color: ChessColor;
  className?: string;
  decorative?: boolean;
}

/**
 * The legacy export name is retained for callers, while every piece now renders
 * from an independent transparent production image rather than inline SVG.
 */
export function ChessPieceSvg({ piece, color, className, decorative = false }: ChessPieceSvgProps) {
  const type = piece.toUpperCase() as PieceType;
  const asset = PIECE_ASSETS[type];
  if (!asset) return null;

  const metrics = CHESS_PIECE_DESIGN_SPEC.pieces[type];
  const style = {
    '--chess-piece-scale': metrics.scale,
    '--chess-piece-offset-y': `${metrics.offsetY}%`,
  } as CSSProperties;

  return (
    <span
      className={`chess-piece-model chess-piece-image chess-piece-model--${color} ${className ?? ''}`.trim()}
      style={style}
      data-piece={type}
      data-color={color}
      data-palette={color === 'white' ? 'ivory' : 'onyx'}
      data-accent="gold"
      data-style="reference-luxury"
      data-renderer="next-image"
      data-baseline={CHESS_PIECE_DESIGN_SPEC.baseline}
      data-scale={metrics.scale}
      aria-hidden={decorative || undefined}
    >
      <Image
        src={`/chess/pieces/${color}-${asset}.webp`}
        alt={decorative ? '' : `${PIECE_LABELS[type]} ${color === 'white' ? 'الأبيض' : 'الأسود'}`}
        width={768}
        height={768}
        sizes="(max-width: 640px) 11vw, 96px"
        draggable={false}
        priority={false}
        className="chess-piece-image__asset"
      />
    </span>
  );
}

export function getPieceLabel(piece: string): string {
  const type = piece.toUpperCase() as PieceType;
  const color = piece === type ? 'أبيض' : 'أسود';
  return `${color} ${PIECE_LABELS[type] ?? piece}`;
}

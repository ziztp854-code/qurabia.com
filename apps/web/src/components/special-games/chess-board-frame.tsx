'use client';

import type { ReactNode } from 'react';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'] as const;

function FileCoordinates({
  position,
  files,
}: {
  position: 'top' | 'bottom';
  files: readonly string[];
}) {
  return (
    <div
      className={`chess-board-frame__coordinates chess-board-frame__coordinates--${position}`}
      aria-hidden="true"
    >
      {files.map((file) => (
        <span key={`${position}-${file}`} className="chess-board-frame__file">
          {file}
        </span>
      ))}
    </div>
  );
}

function RankCoordinates({
  position,
  ranks,
}: {
  position: 'start' | 'end';
  ranks: readonly string[];
}) {
  return (
    <div
      className={`chess-board-frame__coordinates chess-board-frame__coordinates--${position}`}
      aria-hidden="true"
    >
      {ranks.map((rank) => (
        <span key={`${position}-${rank}`} className="chess-board-frame__rank">
          {rank}
        </span>
      ))}
    </div>
  );
}

export function ChessBoardFrame({
  children,
  flipped = false,
  showCoordinates = true,
}: {
  children: ReactNode;
  flipped?: boolean;
  showCoordinates?: boolean;
}) {
  const files = flipped ? [...FILES].reverse() : FILES;
  const ranks = flipped ? [...RANKS].reverse() : RANKS;

  return (
    <div
      className="chess-board-frame-shell"
      data-coordinates={showCoordinates ? 'visible' : 'hidden'}
    >
      <div
        className="chess-board-frame"
        data-material="coal"
        data-coordinates={showCoordinates ? 'visible' : 'hidden'}
        dir="ltr"
      >
        {showCoordinates && <RankCoordinates position="start" ranks={ranks} />}
        {children}
        {showCoordinates && <FileCoordinates position="bottom" files={files} />}
      </div>
    </div>
  );
}

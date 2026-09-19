'use client';

import { useCallback, useState, type KeyboardEvent, type ReactNode } from 'react';

/**
 * CSS-3D flip card used for secret role reveals and similar moments.
 * Pure CSS transforms (no WebGL), keyboard accessible, and respects
 * prefers-reduced-motion via the stylesheet.
 */
export function Game3DCard({
  front,
  back,
  flipLabel,
  onFlipped,
  className,
}: {
  /** Face shown before the card is flipped (never contains secrets). */
  front: ReactNode;
  /** Face revealed after flipping (may contain the secret role). */
  back: ReactNode;
  /** Accessible label for the flip action, e.g. «اكشف دورك». */
  flipLabel: string;
  /** Called once when the card is flipped. */
  onFlipped?: () => void;
  className?: string;
}) {
  const [flipped, setFlipped] = useState(false);

  const flip = useCallback(() => {
    if (flipped) return;
    setFlipped(true);
    onFlipped?.();
  }, [flipped, onFlipped]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      flip();
    }
  };

  return (
    <div className={className ? `game-3d-card ${className}` : 'game-3d-card'}>
      <div
        className="game-3d-card__inner"
        data-flipped={flipped || undefined}
        role="button"
        tabIndex={flipped ? -1 : 0}
        aria-label={flipLabel}
        aria-pressed={flipped}
        onClick={flip}
        onKeyDown={handleKeyDown}
      >
        <div className="game-3d-card__face game-3d-card__face--front" aria-hidden={flipped}>
          {front}
        </div>
        <div className="game-3d-card__face game-3d-card__face--back" aria-hidden={!flipped}>
          {back}
        </div>
      </div>
    </div>
  );
}

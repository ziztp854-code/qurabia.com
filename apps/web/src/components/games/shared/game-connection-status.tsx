'use client';

import { Radio, WifiOff } from 'lucide-react';

export type GameConnectionState = 'connected' | 'connecting' | 'failed';

/**
 * Shared realtime connection indicator for multiplayer games.
 * Announces state changes politely for screen readers.
 */
export function GameConnectionStatus({
  state,
  compact = false,
}: {
  state: GameConnectionState;
  compact?: boolean;
}) {
  const label =
    state === 'connected'
      ? compact
        ? 'متصل'
        : 'متصل بخدمة اللعب'
      : state === 'failed'
        ? 'انقطع الاتصال — جارٍ المحاولة مجددًا'
        : 'جارٍ الاتصال…';

  return (
    <span
      className="game-connection"
      data-state={state}
      role="status"
      aria-live="polite"
    >
      {state === 'failed' ? <WifiOff aria-hidden="true" /> : <Radio aria-hidden="true" />}
      {label}
    </span>
  );
}

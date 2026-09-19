'use client';

import { cn } from '@/lib/utils';

export function MafiaPlayerPicker({
  players,
  selectedId,
  onSelect,
  disabledIds = [],
  disabledLabel,
  placeholder,
}: {
  players: { id: string; displayName: string }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  disabledIds?: string[];
  disabledLabel?: string;
  placeholder?: string;
}) {
  if (players.length === 0) {
    return <p className="mafia-text-muted">لا يوجد لاعبون متاحون.</p>;
  }

  return (
    <div className="mafia-player-picker">
      <p className="mafia-player-picker-label">{placeholder ?? 'اختر لاعبًا'}</p>
      <div
        className="mafia-player-picker-list"
        role="radiogroup"
        aria-label={placeholder ?? 'اختر لاعبًا'}
      >
        {players.map((player) => {
          const isSelected = selectedId === player.id;
          const isDisabled = disabledIds.includes(player.id);
          return (
            <label
              key={player.id}
              className={cn('mafia-player-pick', isSelected && 'mafia-player-pick-selected')}
            >
              <input
                type="radio"
                name="mafia-player-pick"
                value={player.id}
                checked={isSelected}
                disabled={isDisabled}
                onChange={() => !isDisabled && onSelect(player.id)}
              />
              <span className="mafia-player-pick-avatar" aria-hidden="true">
                {player.displayName.slice(0, 2).toUpperCase()}
              </span>
              <span className="mafia-player-pick-name">{player.displayName}</span>
              {isDisabled && disabledLabel && (
                <span className="mafia-player-pick-disabled">{disabledLabel}</span>
              )}
              <span className="mafia-player-pick-check" aria-hidden="true">
                {isSelected && (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

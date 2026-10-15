'use client';

import { Gauge, Timer, Zap } from 'lucide-react';
import { useId } from 'react';
import { cn } from '@/lib/utils';
import type { MafiaGameModeId } from '@/lib/mafia/game-modes';
import { MAFIA_GAME_MODES, applyModeMultipliers } from '@/lib/mafia/game-modes';

const MODE_META: Record<MafiaGameModeId, { icon: typeof Zap; color: string }> = {
  CLASSIC: { icon: Zap, color: 'var(--primary)' },
  SPEED: { icon: Gauge, color: 'var(--primary)' },
  BLIND: { icon: Zap, color: 'var(--muted-foreground)' },
  ASSASSIN: { icon: Zap, color: 'var(--muted-foreground)' },
  CHAOS: { icon: Zap, color: 'var(--muted-foreground)' },
};

export function MafiaModeCards({
  name,
  selected,
  onChange,
}: {
  name: string;
  selected: MafiaGameModeId;
  onChange: (id: MafiaGameModeId) => void;
}) {
  const radioName = useId();

  return (
    <fieldset className="mafia-mode-cards-field">
      <legend className="mafia-section-label">
        <Zap aria-hidden="true" />
        اختر أسلوب المباراة
      </legend>
      <div className="mafia-mode-cards-grid">
        {(Object.keys(MAFIA_GAME_MODES) as MafiaGameModeId[]).map((id) => {
          const mode = MAFIA_GAME_MODES[id];
          const meta = MODE_META[id];
          const Icon = meta.icon;
          const isSelected = selected === id;
          const baseSettings = {
            nightSeconds: 45,
            daySeconds: 90,
            votingSeconds: 45,
            killerCount: 1,
            maxPlayers: 12,
          };
          const timers = applyModeMultipliers(id, baseSettings);
          const totalMinutes =
            Math.round(
              ((timers.nightSeconds + timers.daySeconds + timers.votingSeconds) / 60) * 10,
            ) / 10;

          return (
            <label
              key={id}
              className={cn('mafia-mode-card', isSelected && 'mafia-mode-card-selected')}
              htmlFor={`${radioName}-${id}`}
            >
              <input
                id={`${radioName}-${id}`}
                type="radio"
                name={name}
                value={id}
                checked={isSelected}
                disabled={mode.experimental}
                onChange={() => onChange(id)}
              />
              <div className="mafia-mode-card-icon" style={{ color: meta.color }}>
                <Icon aria-hidden="true" />
              </div>
              <div className="mafia-mode-card-body">
                <div className="mafia-mode-card-head">
                  <span className="mafia-mode-card-name">{mode.label}</span>
                  {mode.experimental && (
                    <span className="mafia-mode-card-experimental">قريبًا — غير متاح</span>
                  )}
                  {isSelected && (
                    <span className="mafia-mode-card-check" aria-hidden="true">
                      <svg
                        inline-size="0.9rem"
                        block-size="0.9rem"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                  )}
                </div>
                <p className="mafia-mode-card-tagline">{mode.tagline}</p>
                {!mode.experimental && (
                  <div className="mafia-mode-card-meta">
                    <span className="mafia-mode-chip">
                      <Timer aria-hidden="true" />
                      افتراضيًا: نحو {totalMinutes} دقيقة للدورة
                    </span>
                  </div>
                )}
                {!mode.experimental && (
                  <ul className="mafia-mode-card-features">
                    {mode.features.slice(0, 2).map((f) => (
                      <li key={f}>
                        <Zap aria-hidden="true" />
                        {f}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

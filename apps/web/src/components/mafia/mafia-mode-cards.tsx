'use client';

import { Gauge, Users, Zap } from 'lucide-react';
import { useId, useState } from 'react';
import { cn } from '@/lib/utils';
import type { MafiaGameModeId } from '@/lib/mafia/game-modes';
import { MAFIA_GAME_MODES, applyModeMultipliers } from '@/lib/mafia/game-modes';

const MODE_META: Record<MafiaGameModeId, { icon: typeof Zap; color: string }> = {
  CLASSIC: { icon: Zap, color: '#ffb74d' },
  SPEED: { icon: Gauge, color: '#ffab40' },
  BLIND: { icon: Zap, color: '#a78bfa' },
  ASSASSIN: { icon: Zap, color: '#ef5350' },
  CHAOS: { icon: Zap, color: '#f472b6' },
};

export function MafiaModeCards({ name }: { name: string }) {
  const radioName = useId();
  const [selected, setSelected] = useState<MafiaGameModeId>('CLASSIC');

  const handleChange = (id: MafiaGameModeId) => {
    setSelected(id);
    syncFormFields(id);
  };

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
          const totalMinutes = Math.round((timers.nightSeconds + timers.daySeconds + timers.votingSeconds) / 60 * 10) / 10;
          const complexity = mode.timeMultiplier < 0.8 ? 'high' : mode.timeMultiplier > 1 ? 'low' : 'medium';
          const complexityLabel = complexity === 'high' ? 'مرتفع' : complexity === 'low' ? 'منخفض' : 'متوسط';
          const complexityColor =
            complexity === 'high'
              ? 'color-mix(in srgb, #f472b6 60%, transparent)'
              : complexity === 'low'
                ? 'color-mix(in srgb, #86efac 60%, transparent)'
                : 'color-mix(in srgb, #fcd34d 60%, transparent)';

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
                onChange={() => handleChange(id)}
              />
              <div className="mafia-mode-card-icon" style={{ color: meta.color }}>
                <Icon aria-hidden="true" />
              </div>
               <div className="mafia-mode-card-body">
                 <div className="mafia-mode-card-head">
                   <span className="mafia-mode-card-name">{mode.label}</span>
                   {mode.experimental && (
                     <span className="mafia-mode-card-experimental">تجريبي</span>
                   )}
                   {isSelected && (
                     <span className="mafia-mode-card-check" aria-hidden="true">
                       <svg inline-size="0.9rem" block-size="0.9rem" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                         <polyline points="20 6 9 17 4 12" />
                       </svg>
                     </span>
                   )}
                 </div>
                <p className="mafia-mode-card-tagline">{mode.tagline}</p>
                <div className="mafia-mode-card-meta">
                  <span className="mafia-mode-chip">
                    <Users aria-hidden="true" />
                    {totalMinutes} دقيقة
                  </span>
                  <span className="mafia-mode-chip" style={{ color: complexityColor, borderColor: complexityColor }}>
                    {complexityLabel}
                  </span>
                </div>
                <ul className="mafia-mode-card-features">
                  {mode.features.slice(0, 2).map((f) => (
                    <li key={f}>
                      <Zap aria-hidden="true" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function syncFormFields(modeId: MafiaGameModeId) {
  if (typeof document === 'undefined') return;
  const baseSettings = {
    nightSeconds: 45,
    daySeconds: 90,
    votingSeconds: 45,
    killerCount: 1,
    maxPlayers: 12,
  };
  const timers = applyModeMultipliers(modeId, baseSettings);
  const mode = MAFIA_GAME_MODES[modeId];
  const speedBoost = Math.max(0, (1 - mode.timeMultiplier) * 0.6);
  const derivedMaxPlayers = Math.max(5, Math.min(30, Math.round(baseSettings.maxPlayers * (1 - speedBoost))));

  const setVal = (id: string, v: number, opts?: { clampMin?: number; clampMax?: number }) => {
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
    if (!el) return;
    let next = v;
    if (opts?.clampMin !== undefined) next = Math.max(opts.clampMin, next);
    if (opts?.clampMax !== undefined) next = Math.min(opts.clampMax, next);
    el.value = String(next);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  setVal('mafia-nightSeconds', timers.nightSeconds, { clampMin: 20, clampMax: 180 });
  setVal('mafia-daySeconds', timers.daySeconds, { clampMin: 30, clampMax: 300 });
  setVal('mafia-votingSeconds', timers.votingSeconds, { clampMin: 20, clampMax: 120 });
  setVal('mafia-killerCount', Math.min(3, timers.killerCount), { clampMin: 1, clampMax: 3 });
  setVal('mafia-maxPlayers', derivedMaxPlayers, { clampMin: 5, clampMax: 30 });
}

'use client';

import { Sparkles, Zap } from 'lucide-react';
import { Badge } from '@/components/ui';
import {
  MAFIA_GAME_MODES,
  applyModeMultipliers,
  type MafiaGameModeId,
} from '@/lib/mafia/game-modes';

export function MafiaModePresets() {
  return (
    <fieldset className="mafia-mode-presets">
      <legend>
        <Sparkles aria-hidden="true" />
        اختيار سريع لأسلوب اللعبة
      </legend>
      <div className="mafia-mode-presets-grid">
        {(Object.keys(MAFIA_GAME_MODES) as MafiaGameModeId[]).map((id) => {
          const mode = MAFIA_GAME_MODES[id];
          return (
            <label
              key={id}
              className="mafia-mode-preset"
              data-mode={id}
              htmlFor={`mafia-mode-${id}`}
            >
              <input
                id={`mafia-mode-${id}`}
                type="radio"
                name="modeId"
                value={id}
                defaultChecked={id === 'CLASSIC'}
                onChange={(e) => {
                  if (!e.currentTarget.checked) return;
                  const baseSettings = {
                    nightSeconds: 45,
                    daySeconds: 90,
                    votingSeconds: 45,
                    killerCount: 1,
                    maxPlayers: 12,
                  };
                  const timers = applyModeMultipliers(id, baseSettings);
                  const mode = MAFIA_GAME_MODES[id];
                  const speedBoost = Math.max(0, (1 - mode.timeMultiplier) * 0.6);
                  const derivedMaxPlayers = Math.max(
                    5,
                    Math.min(
                      30,
                      Math.round(baseSettings.maxPlayers * (1 - speedBoost)),
                    ),
                  );
                  const getNum = (n: string) =>
                    document.getElementById(n) as
                      | (HTMLInputElement | HTMLSelectElement)
                      | null;
                  const setNum = (
                    n: string,
                    v: number,
                    opts?: { clampMin?: number; clampMax?: number },
                  ) => {
                    const el = getNum(n);
                    if (!el) return;
                    let next = v;
                    if (opts?.clampMin !== undefined)
                      next = Math.max(opts.clampMin, next);
                    if (opts?.clampMax !== undefined)
                      next = Math.min(opts.clampMax, next);
                    if (el instanceof HTMLInputElement) {
                      el.value = String(next);
                    } else {
                      el.value = String(next);
                    }
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                  };
                  setNum('mafia-nightSeconds', timers.nightSeconds, {
                    clampMin: 20,
                    clampMax: 180,
                  });
                  setNum('mafia-daySeconds', timers.daySeconds, {
                    clampMin: 30,
                    clampMax: 300,
                  });
                  setNum('mafia-votingSeconds', timers.votingSeconds, {
                    clampMin: 20,
                    clampMax: 120,
                  });
                  setNum('mafia-killerCount', Math.min(3, timers.killerCount));
                  setNum('mafia-maxPlayers', derivedMaxPlayers, {
                    clampMin: 5,
                    clampMax: 30,
                  });
                }}
              />
               <div className="mafia-mode-preset-head">
                 <strong>{mode.label}</strong>
                 <Badge>
                   {mode.timeMultiplier === 1
                     ? 'وقت عادي'
                     : `سرعة ${mode.timeMultiplier < 1 ? 'أسرع' : 'أبطأ'}`}
                 </Badge>
                 {mode.experimental && (
                   <span className="mafia-mode-experimental">تجريبي</span>
                 )}
               </div>
              <p className="muted">{mode.tagline}</p>
              <ul>
                {mode.features.slice(0, 2).map((f) => (
                  <li key={f}>
                    <Zap aria-hidden="true" />
                    {f}
                  </li>
                ))}
              </ul>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

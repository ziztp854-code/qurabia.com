'use client';

import { useState } from 'react';
import { MafiaModeCards } from './mafia-mode-cards';
import { MafiaCompositionPreview } from './mafia-composition-preview';
import { applyModeMultipliers, type MafiaGameModeId } from '@/lib/mafia/game-modes';

export function MafiaGameSettings() {
  const [mode, setMode] = useState<MafiaGameModeId>('CLASSIC');
  const [maxPlayers, setMaxPlayers] = useState('12');
  const [killerCount, setKillerCount] = useState(1);
  const [timers, setTimers] = useState({
    nightSeconds: '45',
    daySeconds: '90',
    votingSeconds: '45',
  });
  const playerCount = Math.min(30, Math.max(5, Math.trunc(Number(maxPlayers) || 5)));
  const maxKillers = Math.min(3, Math.floor((playerCount - 2) / 3));
  const safeKillerCount = Math.min(killerCount, maxKillers);

  function changeMode(next: MafiaGameModeId) {
    setMode(next);
    const defaults = applyModeMultipliers(next, {
      nightSeconds: 45,
      daySeconds: 90,
      votingSeconds: 45,
      killerCount: safeKillerCount,
      maxPlayers: playerCount,
    });
    setTimers({
      nightSeconds: String(defaults.nightSeconds),
      daySeconds: String(defaults.daySeconds),
      votingSeconds: String(defaults.votingSeconds),
    });
  }

  return (
    <>
      <MafiaModeCards name="modeId" selected={mode} onChange={changeMode} />

      <MafiaCompositionPreview
        maxPlayers={playerCount}
        killerCount={safeKillerCount}
        className="mafia-composition-inline"
      />

      <label>
        عدد اللاعبين المتوقع
        <input
          id="mafia-maxPlayers"
          name="maxPlayers"
          type="number"
          min="5"
          max="30"
          value={maxPlayers}
          required
          onChange={(event) => setMaxPlayers(event.target.value)}
          aria-describedby="mafia-composition-help"
        />
      </label>

      <p id="mafia-composition-help" className="muted">
        التوزيع تقديري؛ يُحسم عند البدء حسب عدد المنضمين. يُضاف الحارس من ٧ لاعبين والشاهد من ٨.
      </p>
      <details className="mafia-advanced-details">
        <summary className="mafia-advanced-summary">إعدادات متقدمة</summary>
        <div className="mafia-advanced-body">
          <label>
            عدد القتلة
            <select
              id="mafia-killerCount"
              name="killerCount"
              value={safeKillerCount}
              onChange={(event) => setKillerCount(Number(event.target.value))}
            >
              <option value="1">قاتل واحد</option>
              <option value="2" disabled={maxKillers < 2}>
                قاتلان
              </option>
              <option value="3" disabled={maxKillers < 3}>
                ثلاثة قتلة
              </option>
            </select>
          </label>
          <div className="form-row mafia-settings-timers">
            <label>
              وقت الليل (ثانية)
              <input
                id="mafia-nightSeconds"
                name="nightSeconds"
                type="number"
                min="15"
                max="180"
                value={timers.nightSeconds}
                required
                onChange={(event) => setTimers({ ...timers, nightSeconds: event.target.value })}
              />
            </label>
            <label>
              وقت النهار (ثانية)
              <input
                id="mafia-daySeconds"
                name="daySeconds"
                type="number"
                min="30"
                max="300"
                value={timers.daySeconds}
                required
                onChange={(event) => setTimers({ ...timers, daySeconds: event.target.value })}
              />
            </label>
            <label>
              وقت التصويت (ثانية)
              <input
                id="mafia-votingSeconds"
                name="votingSeconds"
                type="number"
                min="15"
                max="120"
                value={timers.votingSeconds}
                required
                onChange={(event) => setTimers({ ...timers, votingSeconds: event.target.value })}
              />
            </label>
          </div>
          <label>
            إدارة المراحل
            <select name="autoMode" defaultValue="on">
              <option value="on">تلقائية مع تحكم المضيف</option>
              <option value="off">يدوية بالكامل</option>
            </select>
          </label>
          <label>
            الدردشة
            <select name="chatEnabled" defaultValue="on">
              <option value="on">مفعلة</option>
              <option value="off">متوقفة</option>
            </select>
          </label>
          <label>
            مهلة الرسائل (ثانية)
            <input name="slowModeSeconds" type="number" min="0" max="30" defaultValue="2" />
          </label>
        </div>
      </details>
    </>
  );
}

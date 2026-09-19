import { Moon, Sun } from 'lucide-react';
import { MafiaPhaseTimer } from './mafia-phase-timer';
import type { MafiaPhaseName } from '@/lib/mafia/guidance';
import { mafiaPhaseLabels } from '@/lib/mafia/rules';
import { cn, formatNumber } from '@/lib/utils';

const PHASE_BADGE_CLASS: Record<MafiaPhaseName, string> = {
  LOBBY: 'mafia-phase-badge-lobby',
  NIGHT: 'mafia-phase-badge-night',
  DAY: 'mafia-phase-badge-day',
  VOTING: 'mafia-phase-badge-voting',
  FINISHED: 'mafia-phase-badge-finished',
};

const PHASE_ICONS: Record<MafiaPhaseName, typeof Moon | typeof Sun> = {
  LOBBY: Sun,
  NIGHT: Moon,
  DAY: Sun,
  VOTING: Moon,
  FINISHED: Sun,
};

export function MafiaPhaseHeader({
  phase,
  currentRound,
  phaseEndsAt,
  durationSeconds,
  autoMode,
  tickEndpoint,
  participantId,
  className,
}: {
  phase: MafiaPhaseName;
  currentRound: number;
  phaseEndsAt: string | null;
  durationSeconds: number | null;
  autoMode: boolean;
  tickEndpoint: string;
  participantId?: string;
  className?: string;
}) {
  const PhaseIcon = PHASE_ICONS[phase];
  const badgeClass = PHASE_BADGE_CLASS[phase];

  return (
    <header className={cn('mafia-phase-header', className)}>
      <div className="mafia-phase-header-row">
        <div className="mafia-phase-header-info">
          <span className={cn('mafia-phase-badge', badgeClass)}>
            <PhaseIcon aria-hidden="true" />
            {mafiaPhaseLabels[phase]}
          </span>
          {phase !== 'LOBBY' && phase !== 'FINISHED' && (
            <span className="mafia-round-label">
              الجولة {formatNumber(currentRound)}
            </span>
          )}
        </div>
      </div>
      {phase !== 'LOBBY' && phase !== 'FINISHED' && (
        <MafiaPhaseTimer
          phase={phase}
          phaseEndsAt={phaseEndsAt}
          durationSeconds={durationSeconds}
          autoMode={autoMode}
          tickEndpoint={tickEndpoint}
          participantId={participantId}
        />
      )}
    </header>
  );
}

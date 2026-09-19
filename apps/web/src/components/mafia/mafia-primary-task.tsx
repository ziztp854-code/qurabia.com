import { ListChecks } from 'lucide-react';
import { getMafiaMission, mafiaPhaseGuides, type MafiaPhaseName } from '@/lib/mafia/guidance';
import { mafiaPhaseLabels, type MafiaRoleName } from '@/lib/mafia/rules';
import { Badge } from '@/components/ui';

const PHASE_BADGE_CLASS: Record<MafiaPhaseName, string> = {
  LOBBY: 'mafia-phase-badge-lobby',
  NIGHT: 'mafia-phase-badge-night',
  DAY: 'mafia-phase-badge-day',
  VOTING: 'mafia-phase-badge-voting',
  FINISHED: 'mafia-phase-badge-finished',
};

export function MafiaPrimaryTask({
  phase,
  role,
  playerStatus,
  children,
}: {
  phase: MafiaPhaseName;
  role: MafiaRoleName | null;
  playerStatus: string;
  children?: React.ReactNode;
}) {
  const mission = role ? getMafiaMission(role, phase, playerStatus === 'ELIMINATED') : null;
  const badgeClass = PHASE_BADGE_CLASS[phase] ?? 'mafia-phase-badge-lobby';

  if (!mission && !children) {
    return (
      <div className="mafia-primary-task">
        <p className="mafia-text-muted">في انتظار بدء المرحلة...</p>
      </div>
    );
  }

  return (
    <div className="mafia-primary-task">
      <div className="mafia-primary-task-header">
        <ListChecks aria-hidden="true" />
        <span className="mafia-primary-task-title">مهمتك الآن</span>
        <Badge className={badgeClass}>{mafiaPhaseLabels[phase]}</Badge>
      </div>
      <div className="mafia-primary-task-body">
        {mission && (
          <>
            <h3>{mission.title}</h3>
            <p>{mission.summary}</p>
            <ol className="mafia-mission-steps">
              {mission.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            {phase !== 'LOBBY' && phase !== 'FINISHED' && (
              <p className="mafia-mission-next">
                بعد هذه المرحلة: {mafiaPhaseGuides[phase].next}
              </p>
            )}
          </>
        )}
        {children}
      </div>
    </div>
  );
}

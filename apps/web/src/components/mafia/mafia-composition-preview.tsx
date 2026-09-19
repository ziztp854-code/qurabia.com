import { buildMafiaRoles } from '@/lib/mafia/rules';
import { cn } from '@/lib/utils';

const ROLE_CHIP_CLASS: Record<string, string> = {
  KILLER: 'mafia-role-chip-killer',
  DETECTIVE: 'mafia-role-chip-special',
  DOCTOR: 'mafia-role-chip-special',
  GUARD: 'mafia-role-chip-special',
  WITNESS: 'mafia-role-chip-special',
  CITIZEN: 'mafia-role-chip-civilian',
};

export function MafiaCompositionPreview({
  maxPlayers,
  killerCount,
  className,
}: {
  maxPlayers: number;
  killerCount: number;
  className?: string;
}) {
  const roles = buildMafiaRoles(maxPlayers, killerCount);
  const roleCounts = new Map<string, number>();
  for (const r of roles) {
    roleCounts.set(r, (roleCounts.get(r) ?? 0) + 1);
  }

  const specialRoles = ['DETECTIVE', 'DOCTOR', 'GUARD', 'WITNESS'].filter((r) => roleCounts.has(r));
  const citizenCount = roleCounts.get('CITIZEN') ?? 0;

  return (
    <div className={cn('mafia-composition', className)}>
      <div className="mafia-composition-header">
        <h3>التكوين المقترح</h3>
      </div>
      <div className="mafia-composition-roles">
        {roleCounts.get('KILLER')! > 0 && (
          <span className={`mafia-role-chip ${ROLE_CHIP_CLASS['KILLER']}`}>
            {roleCounts.get('KILLER')} قاتل
          </span>
        )}
        {specialRoles.map((r) => (
          <span key={r} className={`mafia-role-chip ${ROLE_CHIP_CLASS[r]}`}>
            {roleCounts.get(r)} {r === 'DETECTIVE' ? 'محقق' : r === 'DOCTOR' ? 'طبيب' : r === 'GUARD' ? 'حارس' : 'شاهد'}
          </span>
        ))}
        {citizenCount > 0 && (
          <span className={`mafia-role-chip ${ROLE_CHIP_CLASS['CITIZEN']}`}>
            {citizenCount} مواطن
          </span>
        )}
      </div>
      <div className="mafia-composition-stats">
        <span>
          <strong>{maxPlayers}</strong> لاعب
        </span>
        <span>
          <strong>{roles.filter((r) => r !== 'CITIZEN').length}</strong> دور خاص
        </span>
      </div>
    </div>
  );
}

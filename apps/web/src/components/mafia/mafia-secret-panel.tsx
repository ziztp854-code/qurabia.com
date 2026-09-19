import { Eye, Target } from 'lucide-react';
import { type MafiaRoleName } from '@/lib/mafia/rules';
import { mafiaRoleGuides } from '@/lib/mafia/guidance';
import { cn } from '@/lib/utils';

export function MafiaSecretPanel({
  role,
  privateNote,
  className,
}: {
  role: MafiaRoleName | null;
  privateNote?: string | null;
  className?: string;
}) {
  if (!role) return null;

  const guide = mafiaRoleGuides[role];

  return (
    <div className={cn('mafia-secret-panel', className)}>
      <div className="mafia-secret-panel-header">
        <Eye aria-hidden="true" />
        <span>معلوماتك السرية</span>
      </div>
      <dl>
        <div>
          <dt>
            <Target aria-hidden="true" />
            هدفك
          </dt>
          <dd>{guide.objective}</dd>
        </div>
        <div>
          <dt>هويتك</dt>
          <dd>{guide.identity}</dd>
        </div>
        <div>
          <dt>السرية</dt>
          <dd>{guide.privacy}</dd>
        </div>
      </dl>
      {privateNote && (
        <p className="mafia-private-note" role="status">
          <strong>معلومة خاصة:</strong> {privateNote}
        </p>
      )}
    </div>
  );
}

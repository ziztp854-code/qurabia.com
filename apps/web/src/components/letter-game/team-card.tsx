import { ArrowDown, ArrowLeft } from 'lucide-react';
import type { TeamId } from '@/lib/letter-game/types';
import styles from './letter-game.module.css';

export function TeamCard({
  team,
  count,
  active,
}: {
  team: TeamId;
  count: number;
  active: boolean;
}) {
  const isGreen = team === 'green';
  const name = isGreen ? 'الفريق الأخضر' : 'الفريق البرتقالي';
  const direction = isGreen ? 'من أعلى إلى أسفل' : 'من اليمين إلى اليسار';
  const Direction = isGreen ? ArrowDown : ArrowLeft;

  return (
    <article className={styles.teamCard} data-team={team} data-active={active || undefined}>
      <Direction aria-hidden="true" />
      <strong>{name}</strong>
      <span className="sr-only">{direction}</span>
      <span className={styles.teamScore}>{count.toLocaleString('ar-SA')}</span>
    </article>
  );
}

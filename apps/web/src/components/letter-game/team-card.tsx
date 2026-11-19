import { Flame, Sprout } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import type { TeamId } from '@/lib/letter-game/types';
import styles from './letter-game.module.css';

const TEAM_COPY = {
  green: { name: 'الفريق الأخضر', Icon: Sprout },
  orange: { name: 'الفريق البرتقالي', Icon: Flame },
} as const;

export function TeamCard({
  team,
  count,
  active,
}: {
  team: TeamId;
  count: number;
  active: boolean;
}) {
  const { name, Icon } = TEAM_COPY[team];

  return (
    <article className={styles.teamCard} data-team={team} data-active={active || undefined}>
      <span className={styles.teamIcon} aria-hidden="true">
        <Icon />
      </span>
      <strong className={styles.teamName}>{name}</strong>
      <span className={styles.teamScore}>
        <strong>{formatNumber(count)}</strong>
        <small>خلية</small>
      </span>
    </article>
  );
}

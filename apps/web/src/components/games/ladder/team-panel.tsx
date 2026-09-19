'use client';

import { Users, Trophy, UserPlus, User } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { formatNumber } from '@/lib/utils';
import styles from './ladder-room.module.css';

type Team = 'right' | 'left';

type TeamPanelProps = {
  team: Team;
  players: Array<{ playerName: string; isHost: boolean }>;
  score: number;
  position: number;
  winningPosition: number;
  isHost: boolean;
};

export function TeamPanel({
  team,
  players,
  score,
  position,
  winningPosition,
  isHost,
}: TeamPanelProps) {
  const isRight = team === 'right';
  const isWinning = position >= winningPosition;
  const teamHasHost = players.some((player) => player.isHost);
  const reduceMotion = useReducedMotion();

  return (
    <aside className={styles.ladderSide} data-team={team} data-host={isHost || undefined}>
      <div className={styles.ladderSideHeader} data-team={team}>
        <div className={styles.headerCluster}>
          <Users aria-hidden="true" size={18} />
          <strong>{isRight ? 'فريق اليمين' : 'فريق اليسار'}</strong>
          {teamHasHost && <span className={styles.hostBadge}>مضيف</span>}
        </div>
        <span className={styles.teamCount}>
          {formatNumber(players.length)} لاعب
        </span>
      </div>

      <div className={styles.teamPlayerList}>
        <AnimatePresence>
          {players.length > 0 ? (
            players.map((player, idx) => (
              <motion.div
                key={`${player.playerName}-${idx}`}
                initial={reduceMotion ? false : { opacity: 0, x: isRight ? 12 : -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0 }}
                className={styles.ladderPlayerItem}
                data-team={team}
              >
                <User aria-hidden="true" className={styles.teamPlayerIcon} />
                <span className={styles.playerName}>{player.playerName}</span>
                {player.isHost && <span className={styles.hostBadge}>مضيف</span>}
              </motion.div>
            ))
          ) : (
            <div
              className={styles.teamPlayerListEmpty}
              role="status"
              aria-live="polite"
            >
              <span className={styles.teamPlayerListEmptyDot} aria-hidden="true" />
              <UserPlus aria-hidden="true" className={styles.teamPlayerIcon} />
              <span>بانتظار اللاعبين...</span>
            </div>
          )}
        </AnimatePresence>
      </div>

      <div
        className={styles.teamScoreboard}
        data-team={team}
        data-winning={isWinning || undefined}
      >
        <div className={styles.teamScoreboardLabel}>الدرجة الحالية</div>
        <div
          className={styles.teamScoreboardValue}
          data-team={team}
          aria-live="polite"
          aria-atomic="true"
        >
          {formatNumber(position)}
        </div>
        <div className={styles.teamScoreboardTarget}>
          الهدف: {formatNumber(winningPosition)}
        </div>
        {isWinning && (
          <Trophy
            aria-hidden="true"
            className={styles.teamScoreboardTrophy}
            data-team={team}
          />
        )}
      </div>

      <div className={styles.teamSideMeta}>
        <div className={styles.teamSideScoreWrap}>
          <span className={styles.teamSideScoreCaption}>إجمالي النقاط</span>
          <div className={styles.teamSideScore}>{formatNumber(score)}</div>
        </div>
      </div>
    </aside>
  );
}

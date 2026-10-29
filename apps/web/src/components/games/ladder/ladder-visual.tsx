'use client';

import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { Diamond, Trophy } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { formatNumber } from '@/lib/utils';
import styles from './ladder-room.module.css';

type LadderVisualProps = {
  rightPosition: number;
  leftPosition: number;
  winningPosition: number;
  currentRound: number;
  totalRounds: number;
  children?: ReactNode;
};

export function LadderVisual({
  rightPosition,
  leftPosition,
  winningPosition,
  currentRound,
  totalRounds,
  children,
}: LadderVisualProps) {
  const reduceMotion = useReducedMotion();
  const steps = useMemo(() => {
    const arr: number[] = [];
    for (let i = winningPosition; i >= 0; i--) arr.push(i);
    return arr;
  }, [winningPosition]);

  const renderColumn = (team: 'right' | 'left', currentPos: number) => {
    return (
      <div className={styles.ladderVisualColumn} data-team={team}>
        <div className={styles.ladderVisualColumnHeader}>
          <span className={styles.ladderVisualColumnLabel} data-team={team}>
            {team === 'right' ? 'فريق اليمين' : 'فريق اليسار'}
          </span>
          <span className={styles.ladderVisualColumnValue}>
            {formatNumber(currentPos)} / {formatNumber(winningPosition)}
          </span>
        </div>

        <div className={styles.ladderSteps}>
          {steps.map((step) => {
            const isActive = step <= currentPos;
            const isCurrent = step === currentPos;
            const isFinish = step === winningPosition;

            return (
              <div
                key={`${team}-${step}`}
                className={styles.ladderStep}
                style={{ width: `${55 + (winningPosition - step) / Math.max(winningPosition, 1) * 45}%` }}
                data-team={team}
                data-active={isActive || undefined}
                data-current={isCurrent || undefined}
              >
                <span className={styles.ladderStepIndex} data-team={team} data-active={isActive}>
                  {formatNumber(step)}
                </span>

                {isCurrent && (
                  <motion.div
                    layoutId={reduceMotion ? undefined : `ladder-marker-${team}`}
                    transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 170, damping: 24 }}
                    className={styles.ladderStepIcon}
                    data-team={team}
                    role="img"
                    aria-label={`موقع ${team === 'right' ? 'فريق اليمين' : 'فريق اليسار'}: ${formatNumber(step)}`}
                  >
                    {isFinish ? <Trophy aria-hidden="true" size={17} /> : <Diamond aria-hidden="true" size={14} />}
                  </motion.div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className={styles.ladderStage}>
      <div className={styles.ladderVisualGrid}>
        {renderColumn('right', rightPosition)}

        <div className={styles.ladderConnector} data-testid="ladder-question-center">

          <div className={styles.connectorMeta}>
            <span className={styles.ladderConnectorLabel}>القمة</span>
            <span className={styles.connectorRound}>
              الجولة {formatNumber(currentRound)} / {formatNumber(totalRounds)}
            </span>
          </div>

          {children && <div className={styles.ladderQuestionCenter}>{children}</div>}

        </div>

        {renderColumn('left', leftPosition)}
      </div>
    </div>
  );
}

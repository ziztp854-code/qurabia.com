'use client';

import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { ArrowUp, ArrowDown, Star, Trophy } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
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
                data-team={team}
                data-active={isActive || undefined}
                data-current={isCurrent || undefined}
              >
                <span className={styles.ladderStepIndex} data-team={team} data-active={isActive}>
                  {formatNumber(step)}
                </span>

                <AnimatePresence mode="wait">
                  {isCurrent && (
                    <motion.div
                      key="indicator"
                      initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={reduceMotion ? undefined : { opacity: 0 }}
                      className={styles.ladderStepIcon}
                      data-team={team}
                    >
                      {isFinish ? (
                        <Trophy aria-hidden="true" size={18} />
                      ) : (
                        <Star aria-hidden="true" size={16} />
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
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
          <ArrowUp aria-hidden="true" className={styles.connectorArrowUp} size={20} />

          <div className={styles.connectorMeta}>
            <span className={styles.ladderConnectorLabel}>القمة</span>
            <span className={styles.connectorRound}>
              الجولة {formatNumber(currentRound)} / {formatNumber(totalRounds)}
            </span>
          </div>

          {children && <div className={styles.ladderQuestionCenter}>{children}</div>}

          <ArrowDown aria-hidden="true" className={styles.connectorArrowDown} size={20} />
        </div>

        {renderColumn('left', leftPosition)}
      </div>
    </div>
  );
}

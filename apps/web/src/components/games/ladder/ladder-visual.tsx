'use client';

import type { ReactNode } from 'react';
import { Trophy } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import styles from './ladder-room.module.css';

type LadderVisualProps = {
  rightPosition: number;
  leftPosition: number;
  winningPosition: number;
  currentRound: number;
  totalRounds: number;
  rightName?: string;
  leftName?: string;
  rightScore?: number;
  leftScore?: number;
  finale?: { title: string; detail: string; reason: string };
  children?: ReactNode;
};

export function LadderVisual({ rightPosition, leftPosition, winningPosition, currentRound, totalRounds, rightName = 'المتسابق الأول', leftName = 'المتسابق الثاني', rightScore = 0, leftScore = 0, finale, children }: LadderVisualProps) {
  const steps = Array.from({ length: winningPosition + 1 }, (_, index) => winningPosition - index);
  const column = (side: 'right' | 'left', position: number, name: string, score: number) => (
    <div className={styles.stageCompetitor} data-side={side} aria-label={`${name}، الدرجة ${formatNumber(position)}، ${formatNumber(score)} نقطة`}>
      <div className={styles.stageAvatar} aria-hidden="true">{name.trim().charAt(0)}</div>
      <strong className={styles.stageName}>{name}</strong>
      <div className={styles.stageSteps} aria-hidden="true">
        {steps.map((step) => <div key={step} className={styles.stageRung} data-current={step === position || undefined}>{formatNumber(step)}</div>)}
      </div>
      <div className={styles.stagePoints}><strong>{formatNumber(score)}</strong> نقطة</div>
    </div>
  );
  return (
    <div className={styles.prestigeStage} dir="ltr">
      <div className={styles.stageLogo} dir="rtl"><i aria-hidden="true" /> السلم</div>
      {column('right', rightPosition, rightName, rightScore)}
      <div className={styles.stageCenter} data-testid="ladder-question-center" dir="rtl">
        {finale ? <div className={styles.stageWinner} role="status"><Trophy aria-hidden="true" /><strong>{finale.title}</strong><span>{finale.detail}</span><small>{finale.reason}</small></div> : children || <span className={styles.stageRound}>الجولة {formatNumber(currentRound)} من {formatNumber(totalRounds)}</span>}
      </div>
      {column('left', leftPosition, leftName, leftScore)}
    </div>
  );
}

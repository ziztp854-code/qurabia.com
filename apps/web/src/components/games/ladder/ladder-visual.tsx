'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
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
  finale?: { title: string; detail: string; reason: string; winnerSide?: 'right' | 'left' };
  children?: ReactNode;
};

export function LadderVisual({ rightPosition, leftPosition, winningPosition, currentRound, totalRounds, rightName = 'المتسابق الأول', leftName = 'المتسابق الثاني', rightScore = 0, leftScore = 0, finale, children }: LadderVisualProps) {
  const steps = Array.from({ length: winningPosition + 1 }, (_, index) => winningPosition - index);
  const column = (side: 'right' | 'left', position: number, name: string, score: number) => (
    <div className={styles.stageCompetitor} data-side={side} aria-label={`${name}، الدرجة ${formatNumber(position)}، ${formatNumber(score)} نقطة`}>
      {finale?.winnerSide === side && <Image src="/game-art/ladder/winner-crown.webp" width={1254} height={1254} alt="" unoptimized className={styles.stageWinnerCrown} data-side={side} data-testid="ladder-winner-crown" aria-hidden="true" />}
      <div className={styles.stageAvatar} aria-hidden="true">{name.trim().charAt(0)}</div>
      <strong className={styles.stageName} data-long={name.trim().length > 10 || undefined}>{name}</strong>
      <div className={styles.stageSteps} aria-hidden="true">
        {steps.map((step) => <div key={step} className={styles.stageRung} data-current={step === position || undefined}>{formatNumber(step)}</div>)}
      </div>
      <div className={styles.stagePoints}><strong>{formatNumber(score)}</strong> نقطة</div>
    </div>
  );
  return (
    <div className={styles.prestigeStage} data-finale={finale ? 'true' : undefined} dir="ltr">
      <div className={styles.stageLogo} dir="rtl"><i aria-hidden="true" /> السلم</div>
      {column('right', rightPosition, rightName, rightScore)}
      <div className={styles.stageCenter} data-testid="ladder-question-center" dir="rtl">
        {finale ? <div className={styles.stageWinner} role="status"><strong data-long={finale.title.length > 16 || undefined}>{finale.title}</strong><span>{finale.detail}</span><small>{finale.reason}</small></div> : children || <span className={styles.stageRound}>الجولة {formatNumber(currentRound)} من {formatNumber(totalRounds)}</span>}
      </div>
      {column('left', leftPosition, leftName, leftScore)}
    </div>
  );
}

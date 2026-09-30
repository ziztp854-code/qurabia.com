'use client';

import { Crown, Flag } from 'lucide-react';
import {
  throneStageState,
  throneStageTagline,
  villageProgress,
  villageStages,
} from '@/lib/kingdoms/stages';
import { date, number, type GameProps } from './shared';
import styles from './stage-ladder.module.css';

type StageState = 'done' | 'current' | 'locked';

const stateOf = (index: number, current: number): StageState =>
  index < current ? 'done' : index === current ? 'current' : 'locked';

/**
 * يعرض سلّم المراحل (التأسيس → النهضة → الازدهار → المرحلة العليا) ثم مرحلة العرش كخاتمة
 * للموسم. كل القيم مشتقة من حالة الخادم: مجموع مستويات المباني وموعد فتح العرش.
 */
export function StageLadder({ view, village }: Pick<GameProps, 'view' | 'village'>) {
  const progress = villageProgress(village, view.config);
  const throne = throneStageState(view);
  const throneState: StageState = throne.ended ? 'done' : throne.unlocked ? 'current' : 'locked';
  const currentState: StageState = throneState === 'current' ? 'done' : 'current';
  const winnerName = throne.winnerId
    ? (view.leaderboard.find((player) => player.id === throne.winnerId)?.name ??
      view.map.find((target) => target.ownerId === throne.winnerId)?.kingdomName ??
      null)
    : null;

  return (
    <section className={styles.ladder} aria-label="سلّم مراحل القرية">
      <header className={styles.head}>
        <div>
          <p className={styles.eyebrow}>
            <Flag size={14} aria-hidden="true" />
            سلّم المراحل
          </p>
          <h3>القرية في {progress.stage.name}</h3>
          <p className={styles.note}>{progress.stage.tagline}</p>
        </div>
        <span className={styles.counter}>
          {number(progress.levels)} من {number(progress.maxLevels)} مستوى
        </span>
      </header>
      <span
        role="progressbar"
        aria-label="تقدم القرية نحو المرحلة العليا"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
        aria-valuetext={`${number(progress.percent)}٪ من مجموع مستويات القرية`}
        className={styles.track}
      >
        <span style={{ width: `${progress.percent}%` }} />
      </span>
      <ol className={styles.steps}>
        {villageStages.map((stage) => {
          const state = stateOf(stage.index, progress.stage.index);
          return (
            <li
              key={stage.key}
              data-state={state}
              aria-current={state === 'current' && currentState === 'current' ? 'step' : undefined}
            >
              <span className={styles.node}>{number(stage.index)}</span>
              <strong>{stage.name}</strong>
              <span className={styles.note}>{stage.tagline}</span>
            </li>
          );
        })}
        <li data-state={throneState} aria-current={throneState === 'current' ? 'step' : undefined}>
          <span className={styles.node}>
            <Crown size={16} aria-hidden="true" />
          </span>
          <strong>{throne.name}</strong>
          <span className={styles.note}>
            {throne.ended
              ? `انتهت خاتمة الموسم${winnerName ? ` · صاحب العرش ${winnerName}` : ''}`
              : throne.unlocked
                ? `مفتوحة الآن · رصيد عهدك ${number(throne.contribution)}`
                : `تُفتح بعد ${number(Math.round(view.config.throneUnlockFraction * 100))}٪ من الموسم · ${date(
                    throne.unlockAt,
                  )}`}
          </span>
          {!throne.ended && (
            <span className={styles.note}>
              {throne.unlocked
                ? `تنتهي المساهمات ${date(throne.endsAt)}`
                : `متبقٍ ${number(throne.remainingSeconds)} ثانية`}
            </span>
          )}
          <span className={styles.note}>{throneStageTagline}</span>
        </li>
      </ol>
      <p className={styles.note}>
        {progress.next
          ? `المرحلة التالية: ${progress.next.name} عند ${number(
              Math.round((progress.nextFraction ?? 0) * 100),
            )}٪ من المستويات (${number(progress.nextLevels ?? 0)} مستوى).`
          : `أعلى مرحلة بلغتها القرية: ${number(progress.topBuildings)} مبنى في المرحلة العليا، و${number(
              progress.maxedBuildings,
            )} بلغ الحد الأعلى.`}
      </p>
    </section>
  );
}

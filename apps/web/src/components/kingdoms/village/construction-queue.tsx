'use client';

import { Button } from '@/components/ui';
import { date, number, type GameProps } from '../shared';
import { useViewClock } from '../use-view-clock';
import panelStyles from '../village.module.css';
import styles from './village-progress.module.css';

export function ConstructionQueue({ view, village, busy, send }: GameProps) {
  const pending = village.constructionQueue?.filter((item) => item.status === 'BUILDING' || item.status === 'QUEUED') ?? [];
  const active = pending.find((item) => item.status === 'BUILDING') ?? null;
  const build = active ?? village.build ?? null;
  const now = useViewClock(view, build?.endsAt ?? view.serverNow, `construction:${village.id}`);
  const progress =
    build && build.startedAt !== undefined && build.endsAt > build.startedAt
      ? Math.min(100, Math.max(0, Math.round(((now - build.startedAt) / (build.endsAt - build.startedAt)) * 100)))
      : null;
  const buildName = build ? view.config.buildings[build.building].name : '';
  return (
    <div className={styles.queue}>
      <h3>قائمة البناء</h3>
      {pending.length > 0 ? <ol className={styles.items} aria-label="مشاريع البناء">
        {pending.map((item) => {
          const active = item.status === 'BUILDING';
          const refund = item.legacy ? 0 : active ? (view.config.construction?.activeRefund ?? 0.5) : (view.config.construction?.queuedRefund ?? 1);
          return <li className={styles.item} key={item.id}>
            <strong>{view.config.buildings[item.building].name} · المستوى {number(item.targetLevel)}</strong>
            <span>{active ? 'قيد البناء' : 'في الانتظار'}</span>
            {active && <span>المتبقي {number(Math.max(0, Math.ceil((item.endsAt - now) / 1000)))} ثانية</span>}
            <time dateTime={new Date(item.startedAt).toISOString()}>{active ? 'بدأ' : 'يبدأ'} {date(item.startedAt)}</time>
            <time dateTime={new Date(item.endsAt).toISOString()}>يكتمل {date(item.endsAt)}</time>
            <span className={styles.policy}>استرداد الإلغاء {number(refund * 100)}٪، ضمن سعة المخزن. إلغاء هذا التطوير يلغي ترقياته اللاحقة للمبنى نفسه.</span>
            <Button variant="outline" disabled={busy} aria-label={`إلغاء ${view.config.buildings[item.building].name} المستوى ${number(item.targetLevel)}`}
              onClick={() => void send({ type: 'cancelBuild', villageId: village.id, itemId: item.id })}>إلغاء البناء</Button>
          </li>;
        })}
      </ol> : village.build ? <>
        <p>{view.config.buildings[village.build.building].name} · المستوى {number(village.build.level)}</p>
        <time dateTime={new Date(village.build.endsAt).toISOString()}>يكتمل {date(village.build.endsAt)}</time>
      </> : <p>لا بناء قيد التنفيذ</p>}
      {progress !== null && (
        <span
          role="progressbar"
          aria-label={`تقدم قائمة بناء ${buildName}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          aria-valuetext={`${number(progress)}٪ من مدة البناء`}
          className={panelStyles.bar}
        >
          <span style={{ width: `${progress}%` }} />
        </span>
      )}
    </div>
  );
}

import { Button } from '@/components/ui';
import { date, number, type GameProps } from '../shared';
import styles from './village-progress.module.css';

export function ConstructionQueue({ view, village, busy, send }: GameProps) {
  const pending = village.constructionQueue?.filter((item) => item.status === 'BUILDING' || item.status === 'QUEUED') ?? [];
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
            {active && <span>المتبقي {number(Math.max(0, Math.ceil((item.endsAt - view.serverNow) / 1000)))} ثانية</span>}
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
    </div>
  );
}

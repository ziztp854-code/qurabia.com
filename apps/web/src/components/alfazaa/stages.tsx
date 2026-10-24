'use client';
/* eslint-disable @next/next/no-img-element */
import catalogData from '@/lib/alfazaa/data/catalog.json';
import art from '@/lib/alfazaa/data/art.json';
import type { Catalog } from '@/lib/alfazaa/domain/types';
import styles from './stages.module.css';
const catalog = catalogData as unknown as Catalog;
function MapPreview({ level }: { level: Catalog['levels'][number] }) {
  const nodes = [...level.buildings, ...level.barriers];
  const minX = Math.min(...nodes.map((node) => node.x)),
    maxX = Math.max(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y)),
    maxY = Math.max(...nodes.map((node) => node.y));
  const scale = Math.min(80 / Math.max(1, maxX - minX), 52 / Math.max(1, maxY - minY));
  const point = (node: { x: number; y: number }) => ({
    x: 50 + (node.x - (minX + maxX) / 2) * scale,
    y: 35 - (node.y - (minY + maxY) / 2) * scale,
  });
  return (
    <svg viewBox="0 0 100 70" aria-hidden="true" className={styles.miniMap}>
      {level.barriers.map((node, index) => {
        const p = point(node);
        return (
          <rect
            key={`barrier-${index}`}
            x={p.x - 2}
            y={p.y - 1}
            width="4"
            height="2"
            className={styles.barrier}
          />
        );
      })}
      {level.buildings.map((node) => {
        const p = point(node);
        return (
          <g key={node.id}>
            <circle
              cx={p.x}
              cy={p.y}
              r="5"
              className={
                node.camp === catalog.meta.blueCamp
                  ? styles.blue
                  : node.camp === catalog.meta.neutralCamp
                    ? styles.neutral
                    : styles.enemy
              }
            />
            <text x={p.x} y={p.y + 1.8}>
              {Math.floor(node.hp)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
export function Stages({
  completed,
  busy,
  onStart,
}: {
  completed: number[];
  busy: boolean;
  onStart: (id: number) => void;
}) {
  const next = catalog.levels.find((level) => !completed.includes(level.id));
  return (
    <section className={styles.stages} aria-label="مراحل الفزعة">
      <header>
        <img src={art.ui.world} alt="" />
        <div>
          <h2>طريق الفزعة</h2>
          <p>65 مرحلة من خرائط اللعبة الأصلية. اختر ساحتك واحتلّ الأبراج.</p>
        </div>
        <b dir="ltr">{completed.length} / 65</b>
      </header>
      <div className={styles.intro}>
        <p>
          الأزرق جيشك، والأحمر خصمك، والرمادي أبراج محايدة. اضغط على برجك ثم الهدف لإرسال الجنود،
          وراقب الحواجز بينهما.
        </p>
        {next && (
          <button disabled={busy} onClick={() => onStart(next.id)}>
            تابع إلى المرحلة {next.id}
          </button>
        )}
      </div>
      <div className={styles.legend}>
        <span>
          <i className={styles.blue} />
          جيشك
        </span>
        <span>
          <i className={styles.enemy} />
          خصم
        </span>
        <span>
          <i className={styles.neutral} />
          محايد
        </span>
      </div>
      <div className={styles.grid}>
        {catalog.levels.map((level) => (
          <button
            disabled={busy}
            key={level.id}
            onClick={() => onStart(level.id)}
            aria-label={`بدء المرحلة ${level.id}`}
            className={`${styles.stage} ${completed.includes(level.id) ? styles.completed : ''} ${next?.id === level.id ? styles.next : ''}`}
          >
            <div className={styles.stageName}>
              <strong>المرحلة {level.id.toLocaleString('ar-SA')}</strong>
              <small>
                {completed.includes(level.id)
                  ? 'مكتملة'
                  : next?.id === level.id
                    ? 'التالية'
                    : 'متاحة'}
              </small>
            </div>
            <MapPreview level={level} />
            <span className={styles.details}>
              {level.buildings.length} أبراج
              {level.barriers.length ? ` · ${level.barriers.length} حواجز` : ''}
            </span>
          </button>
        ))}
      </div>
      <p className={styles.note}>
        كل المراحل متاحة للتجربة. تحفظ علامة الإكمال بعد الفوز؛ التدريب لا يمنح عملات أو نقاط تصنيف.
      </p>
    </section>
  );
}

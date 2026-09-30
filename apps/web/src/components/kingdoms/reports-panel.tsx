'use client';

import { Button } from '@/components/ui';
import { unitKeys } from '@/lib/kingdoms/types';
import { ResourceText, Empty, date, number, type GameProps } from './shared';
import styles from './kingdoms.module.css';

const quests = [
  { id: 'builder', name: 'بناة المملكة', description: 'طوّر مباني قريتك لبدء نهضة المملكة.' },
  { id: 'commander', name: 'راية الجيش', description: 'جهّز عشر وحدات على الأقل في إحدى قراك.' },
  { id: 'merchant', name: 'طريق التجارة', description: 'أتمم تبادلًا تجاريًا مع مملكة أخرى.' },
  { id: 'founder', name: 'آفاق جديدة', description: 'أسّس قرية ثانية ووسّع مملكتك.' },
] as const;

export function ReportsPanel({ view, busy, send }: GameProps) {
  return (
    <div className={styles.split}>
      <section className={styles.panel}>
        <h2>تقارير المملكة وإشعاراتها</h2>
        {view.reports.length ? (
          [...view.reports].reverse().map((report) => (
            <details key={report.id} className={styles.row}>
              <summary style={{ cursor: 'pointer', minHeight: 44 }}>
                <strong>{report.title}</strong>{' '}
                <time className={styles.cost}>{date(report.at)}</time>
              </summary>
              <p className={styles.report}>{report.detail}</p>
              {report.combat && (
                <>
                  <p>
                    قوة الهجوم {number(report.combat.attack)} · قوة الدفاع{' '}
                    {number(report.combat.defense)}
                  </p>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>الوحدة</th>
                          <th>المهاجم قبل / بعد</th>
                          <th>المدافع قبل / بعد</th>
                        </tr>
                      </thead>
                      <tbody>
                        {unitKeys.map((unit) => (
                          <tr key={unit}>
                            <th>{view.config.units[unit].name}</th>
                            <td>
                              {number(report.combat!.attackerBefore[unit])} /{' '}
                              {number(report.combat!.attackerAfter[unit])}
                            </td>
                            <td>
                              {number(report.combat!.defenderBefore[unit])} /{' '}
                              {number(report.combat!.defenderAfter[unit])}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p>
                    الغنائم: <ResourceText resources={report.combat.loot} />
                  </p>
                </>
              )}
              {report.intel && (
                <>
                  <h3>نتائج الاستطلاع</h3>
                  <ResourceText resources={report.intel.resources} />
                  <p>
                    {unitKeys
                      .map(
                        (unit) =>
                          `${view.config.units[unit].name}: ${number(report.intel!.troops[unit])}`,
                      )
                      .join(' · ')}
                  </p>
                  <p>
                    {Object.entries(report.intel.buildings)
                      .map(
                        ([building, level]) =>
                          `${view.config.buildings[building as keyof typeof view.config.buildings].name}: ${level}`,
                      )
                      .join(' · ')}
                  </p>
                </>
              )}
            </details>
          ))
        ) : (
          <Empty>ستظهر نتائج حملاتك وبنائك وتدريبك هنا.</Empty>
        )}
      </section>
      <section className={styles.panel}>
        <h2>المهام والإنجازات</h2>
        {quests.map((quest) => (
          <article className={styles.row} key={quest.id}>
            <div>
              <h3>{quest.name}</h3>
              <p className={styles.cost}>{quest.description}</p>
            </div>
            <Button
              variant="outline"
              disabled={busy || view.player?.claims.includes(quest.id)}
              onClick={() => void send({ type: 'claim', mission: quest.id })}
            >
              {view.player?.claims.includes(quest.id)
                ? 'تم استلام المكافأة'
                : 'تحقق واستلم المكافأة'}
            </Button>
          </article>
        ))}
        <h3>إنجازات مكتسبة</h3>
        {view.player?.achievements.length ? (
          <ul>
            {view.player.achievements.map((achievement) => (
              <li key={achievement}>
                {quests.find((quest) => quest.id === achievement)?.name ?? achievement}
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.muted}>أكمل مهامك لإضافة أول إنجاز.</p>
        )}
      </section>
    </div>
  );
}

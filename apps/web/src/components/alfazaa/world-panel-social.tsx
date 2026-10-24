'use client';
import { useState } from 'react';
import type { Village, Resource } from '@/lib/kingdoms/types';
import type { projectSharedWorld, WorldCommand } from '@/lib/alfazaa/realm/world-engine';
import { resourceKeys } from '@/lib/kingdoms/types';
import { resources } from '@/lib/kingdoms/config';
import styles from './world-panel.module.css';

const names: Record<Resource, string> = {
  wood: 'خشب',
  stone: 'حجر',
  iron: 'حديد',
  food: 'غذاء',
  gold: 'ذهب',
};
export function WorldSocial({
  world,
  village,
  busy,
  action,
  command,
}: {
  world: ReturnType<typeof projectSharedWorld>;
  village: Village;
  busy: boolean;
  action: (value: unknown) => void;
  command: (value: WorldCommand) => void;
}) {
  const [name, setName] = useState('حلف الفزعة');
  const [give, setGive] = useState<Resource>('wood');
  const [want, setWant] = useState<Resource>('stone');
  const [amount, setAmount] = useState(100);
  const own = world.alliances.find((a) => a.id === world.player?.allianceId);
  const role = own && world.player && own.members[world.player.id];
  const manager = role === 'leader' || role === 'officer';
  const playerName = (id: string) => world.leaderboard.find((p) => p.id === id)?.name ?? 'لاعب';
  const list = (values: ReturnType<typeof resources>) =>
    resourceKeys
      .filter((k) => values[k] > 0)
      .map((k) => `${Math.floor(values[k])} ${names[k]}`)
      .join('، ');
  return (
    <div className={styles.columns}>
      <section className={styles.section}>
        <h3>التحالفات</h3>
        <p>ابنِ دار العهد أولًا. الانضمام طلب يراجعه قائد التحالف أو ضابطه.</p>
        {!own ? (
          <>
            <label>
              اسم التحالف
              <input
                minLength={2}
                maxLength={40}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button disabled={busy} onClick={() => action({ type: 'allianceCreate', name })}>
              تأسيس التحالف
            </button>
            <ul>
              {world.alliances.map((a) => (
                <li key={a.id}>
                  {a.name} · {Object.keys(a.members).length} عضو{' '}
                  <button
                    disabled={busy}
                    onClick={() => action({ type: 'allianceJoin', allianceId: a.id })}
                  >
                    طلب انضمام
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <p>
              <strong>{own.name}</strong> · رتبتك:{' '}
              {role === 'leader' ? 'القائد' : role === 'officer' ? 'ضابط' : 'عضو'}
            </p>
            <ul>
              {Object.entries(own.members).map(([id, r]) => (
                <li key={id}>
                  {playerName(id)} · {r === 'leader' ? 'القائد' : r === 'officer' ? 'ضابط' : 'عضو'}
                  {role === 'leader' && id !== world.player?.id && (
                    <div className={styles.actions}>
                      <button
                        disabled={busy}
                        onClick={() =>
                          action({
                            type: 'allianceRole',
                            playerId: id,
                            role: r === 'officer' ? 'member' : 'officer',
                          })
                        }
                      >
                        {r === 'officer' ? 'إعفاء الضابط' : 'تعيين ضابط'}
                      </button>
                      <button
                        disabled={busy}
                        onClick={() =>
                          action({ type: 'allianceRole', playerId: id, role: 'leader' })
                        }
                      >
                        نقل القيادة
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => action({ type: 'allianceKick', playerId: id })}
                      >
                        إخراج
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {manager && (
              <>
                <h4>طلبات الانضمام</h4>
                <ul>
                  {own.pending?.map((id) => (
                    <li key={id}>
                      {playerName(id)}{' '}
                      <button
                        disabled={busy}
                        onClick={() => action({ type: 'allianceApprove', playerId: id })}
                      >
                        قبول
                      </button>{' '}
                      <button
                        disabled={busy}
                        onClick={() => action({ type: 'allianceReject', playerId: id })}
                      >
                        رفض
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <button disabled={busy} onClick={() => action({ type: 'allianceLeave' })}>
              مغادرة التحالف
            </button>
            {world.guild && (
              <>
                <h4>خزانة التحالف وأبحاثه</h4>
                <p>
                  الخزانة: {world.guild.treasury} ذهب · بحث التدريب مستوى{' '}
                  {world.guild.trainingLevel}/10 · تخفيض مدة التدريب الجديد{' '}
                  {Math.round(world.guild.trainingBonus * 100)}٪.
                </p>
                <label>
                  ذهب التبرع من المخفر
                  <input
                    type="number"
                    min={1}
                    max={1e6}
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                  />
                </label>
                <button
                  disabled={busy}
                  onClick={() => command({ type: 'alliance-donate', amount })}
                >
                  تبرع للتحالف
                </button>
                {manager && (
                  <button disabled={busy} onClick={() => command({ type: 'alliance-research' })}>
                    بحث التدريب ({world.guild.researchCost} ذهب من الخزانة)
                  </button>
                )}
                <h4>مساعدة الأعضاء</h4>
                <p>
                  تختصر المساعدة 30 ثانية من البناء النشط لعضو آخر، مرة لكل لاعب وبحد أقصى 10
                  مساعدين.
                </p>
                {world.allianceHelp.map((h) => (
                  <button
                    key={h.itemId}
                    disabled={busy}
                    onClick={() =>
                      command({ type: 'alliance-help', villageId: h.villageId, itemId: h.itemId })
                    }
                  >
                    مساعدة بناء {h.name}
                  </button>
                ))}
                <h4>زعيم التحالف اليومي (خصم آلي)</h4>
                <p>
                  حياة الزعيم: {world.guild.boss.hp}/1000. كل هجوم يستخدم {Math.min(amount, 10000)}{' '}
                  حارسًا من المخفر ويفقد 10٪ منهم على الأقل جنديًا واحدًا. المكافأة 100 ذهب للمساهم
                  بعد الهزيمة، مرة للحساب في اليوم بتوقيت الرياض.
                </p>
                <label>
                  حراس الهجوم
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                  />
                </label>
                <button
                  disabled={busy || world.guild.boss.hp === 0}
                  onClick={() =>
                    command({
                      type: 'alliance-boss',
                      unit: 'guard',
                      count: Math.min(amount, 10000),
                    })
                  }
                >
                  مهاجمة الزعيم بالحراس
                </button>
                <button
                  disabled={busy || world.guild.boss.hp > 0}
                  onClick={() => command({ type: 'alliance-boss-claim' })}
                >
                  استلام مكافأة المساهمة
                </button>
              </>
            )}
            {manager &&
              world.alliances
                .filter((a) => a.id !== own.id)
                .map((a) => (
                  <div key={a.id}>
                    <p>
                      العلاقة مع {a.name}: {own.diplomacy[a.id] ?? 'محايدة'}
                    </p>
                    <div className={styles.actions}>
                      {(['war', 'peace', 'ally'] as const).map((status) => (
                        <button
                          key={status}
                          disabled={busy}
                          onClick={() => action({ type: 'diplomacy', allianceId: a.id, status })}
                        >
                          {status === 'war' ? 'حرب' : status === 'peace' ? 'سلام' : 'تحالف'}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
          </>
        )}
      </section>
      <section className={styles.section}>
        <h3>سوق اللاعبين</h3>
        <p>ابنِ السوق أولًا. تُحجز موارد العرض حتى يقبله لاعب آخر أو تلغيه.</p>
        <label>
          أعرض
          <select value={give} onChange={(e) => setGive(e.target.value as Resource)}>
            {resourceKeys.map((r) => (
              <option key={r} value={r}>
                {names[r]}
              </option>
            ))}
          </select>
        </label>
        <label>
          مقابل
          <select value={want} onChange={(e) => setWant(e.target.value as Resource)}>
            {resourceKeys.map((r) => (
              <option key={r} value={r}>
                {names[r]}
              </option>
            ))}
          </select>
        </label>
        <label>
          الكمية لكل جانب
          <input
            type="number"
            min={1}
            max={1e6}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
        </label>
        <button
          disabled={busy || give === want}
          onClick={() =>
            action({
              type: 'tradeOffer',
              villageId: village.id,
              give: { ...resources(), [give]: amount },
              want: { ...resources(), [want]: amount },
            })
          }
        >
          نشر عرض محجوز
        </button>
        <ul>
          {world.offers.map((o) => (
            <li key={o.id}>
              <p>
                {playerName(o.ownerId)}: {list(o.give)} مقابل {list(o.want)}
              </p>
              <button
                disabled={busy}
                onClick={() =>
                  action(
                    o.ownerId === world.player?.id
                      ? { type: 'tradeCancel', offerId: o.id }
                      : { type: 'tradeAccept', villageId: village.id, offerId: o.id },
                  )
                }
              >
                {o.ownerId === world.player?.id ? 'إلغاء واسترداد' : 'قبول العرض'}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

'use client';

import { Button, Input, Select } from '@/components/ui';
import {
  CommandForm,
  ResourceFields,
  ResourceText,
  Empty,
  amounts,
  number,
  type GameProps,
} from './shared';
import styles from './kingdoms.module.css';
import { diplomacyLabel } from './diplomacy-label';
import { AllianceEventCard } from './alliance-event-card';

export function MarketPanel({ view, village, busy, send }: GameProps) {
  return (
    <div className={styles.split}>
      <section className={styles.panel}>
        <h2>سوق الممالك</h2>
        <p className={styles.muted}>
          تُحجز موارد عرضك عند نشره. يجب أن تملك سوقًا، وأن تتسع مخازنك للموارد الواردة.
        </p>
        {view.offers.length ? (
          view.offers.map((offer) => (
            <article className={styles.row} key={offer.id}>
              <div>
                <strong>
                  {view.leaderboard.find((player) => player.id === offer.ownerId)?.name ?? 'مملكة'}
                </strong>
                <p>
                  يعرض: <ResourceText resources={offer.give} />
                </p>
                <p>
                  مقابل: <ResourceText resources={offer.want} />
                </p>
              </div>
              <Button
                disabled={busy}
                variant="outline"
                onClick={() =>
                  void send(
                    offer.ownerId === view.player?.id
                      ? { type: 'tradeCancel', offerId: offer.id }
                      : { type: 'tradeAccept', villageId: village.id, offerId: offer.id },
                  )
                }
              >
                {offer.ownerId === view.player?.id ? 'ألغِ العرض' : 'أتمم التبادل'}
              </Button>
            </article>
          ))
        ) : (
          <Empty>لا عروض حاليًا. أنشئ أول عرض تجاري.</Empty>
        )}
      </section>
      <section className={styles.panel}>
        <h2>عرض تجاري جديد</h2>
        <CommandForm
          busy={busy}
          label="انشر العرض"
          onSubmit={(form) =>
            void send({
              type: 'tradeOffer',
              villageId: village.id,
              give: amounts(form, 'give'),
              want: amounts(form, 'want'),
            })
          }
        >
          <ResourceFields prefix="give" title="الموارد التي تقدمها" />
          <ResourceFields prefix="want" title="الموارد التي تطلبها" />
        </CommandForm>
      </section>
    </div>
  );
}

const roles = { leader: 'قائد', officer: 'ضابط', member: 'عضو' } as const;
const diplomatic = { war: 'حرب', peace: 'سلام', ally: 'حلف' } as const;

export function AlliancePanel({ view, village, busy, send }: GameProps) {
  const own = view.alliances.find((alliance) => alliance.id === view.player?.allianceId);
  const leader = own?.members[view.player?.id ?? ''] === 'leader';
  const canManage = leader || own?.members[view.player?.id ?? ''] === 'officer';
  return (
    <div>
      <AllianceEventCard view={view} village={village} busy={busy} send={send} />
      <div className={styles.split}>
        <section className={styles.panel}>
          <h2>{own?.name ?? 'عهد يجمع الممالك'}</h2>
          {own ? (
            <>
              <p className={styles.muted}>
                رتبتك: {roles[own.members[view.player!.id]]}. صلاحيات الرتب تُطبّق على كل أمر.
              </p>
              {Object.entries(own.members).map(([id, role]) => (
                <div key={id} className={styles.row}>
                  <span>
                    {view.leaderboard.find((player) => player.id === id)?.name ?? id} ·{' '}
                    {roles[role]}
                  </span>
                  {leader && (
                    <CommandForm
                      busy={busy}
                      label="حدّث الرتبة"
                      onSubmit={(data) =>
                        void send({
                          type: 'allianceRole',
                          playerId: id,
                          role: String(data.get('role')) as keyof typeof roles,
                        })
                      }
                    >
                      <Select name="role" label="رتبة العضو" defaultValue={role}>
                        {Object.entries(roles).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    </CommandForm>
                  )}
                  {canManage &&
                    id !== view.player?.id &&
                    role !== 'leader' &&
                    (leader || role === 'member') && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => void send({ type: 'allianceKick', playerId: id })}
                      >
                        أخرج العضو
                      </Button>
                    )}
                </div>
              ))}
              {canManage && (
                <section aria-label="طلبات الانضمام">
                  <h3>طلبات الانضمام</h3>
                  {own.pending?.length ? (
                    own.pending.map((id) => (
                      <div className={styles.row} key={id}>
                        <span>
                          {view.leaderboard.find((player) => player.id === id)?.name ??
                            view.map.find((village) => village.ownerId === id)?.kingdomName ??
                            id}
                        </span>
                        <Button
                          disabled={busy}
                          onClick={() => void send({ type: 'allianceApprove', playerId: id })}
                        >
                          اقبل الطلب
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => void send({ type: 'allianceReject', playerId: id })}
                        >
                          ارفض الطلب
                        </Button>
                      </div>
                    ))
                  ) : (
                    <p className={styles.cost}>لا طلبات معلّقة.</p>
                  )}
                </section>
              )}
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void send({ type: 'allianceLeave' })}
              >
                غادر التحالف
              </Button>
            </>
          ) : (
            <>
              <p className={styles.muted}>
                ابنِ دار العهد ثم أنشئ تحالفًا أو اطلب الانضمام إلى تحالف قائم. تبدأ العضوية بعد
                موافقة القيادة.
              </p>
              <CommandForm
                busy={busy}
                label="أنشئ التحالف"
                onSubmit={(form) =>
                  void send({ type: 'allianceCreate', name: String(form.get('name')) })
                }
              >
                <Input name="name" label="اسم التحالف" minLength={2} maxLength={40} required />
              </CommandForm>
            </>
          )}
        </section>
        <section className={styles.panel}>
          <h2>التحالفات والدبلوماسية</h2>
          <p className={styles.cost}>
            السلام والتحالف يتطلبان موافقة الطرفين. إعلان الحرب ينهي العهد بين التحالفين.
          </p>
          {view.alliances
            .filter((alliance) => alliance.id !== own?.id)
            .map((alliance) => (
              <article className={styles.row} key={alliance.id}>
                <div>
                  <strong>{alliance.name}</strong>
                  <p className={styles.cost}>
                    {number(Object.keys(alliance.members).length)} أعضاء{' '}
                    {own &&
                      `· ${diplomacyLabel(own.diplomacy[alliance.id], alliance.diplomacy[own.id])}`}
                  </p>
                </div>
                {!own ? (
                  <Button
                    disabled={busy || alliance.pending?.includes(view.player?.id ?? '')}
                    variant="outline"
                    onClick={() => void send({ type: 'allianceJoin', allianceId: alliance.id })}
                  >
                    {alliance.pending?.includes(view.player?.id ?? '')
                      ? 'طلبك بانتظار الموافقة'
                      : 'اطلب الانضمام'}
                  </Button>
                ) : (
                  canManage && (
                    <CommandForm
                      busy={busy}
                      label="حدّث العلاقة"
                      onSubmit={(data) =>
                        void send({
                          type: 'diplomacy',
                          allianceId: alliance.id,
                          status: String(data.get('status')) as keyof typeof diplomatic,
                        })
                      }
                    >
                      <Select
                        name="status"
                        label={`العلاقة مع ${alliance.name}`}
                        defaultValue={own.diplomacy[alliance.id] ?? ''}
                        required
                      >
                        <option value="" disabled>
                          اختر العلاقة المقترحة
                        </option>
                        {Object.entries(diplomatic).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    </CommandForm>
                  )
                )}
              </article>
            ))}
          {view.alliances.filter((alliance) => alliance.id !== own?.id).length === 0 && (
            <Empty>لا تحالفات أخرى حتى الآن.</Empty>
          )}
        </section>
      </div>
    </div>
  );
}

export function ThronePanel({ view, village, busy, send }: GameProps) {
  const unlock =
    view.season.startsAt +
    (view.season.endsAt - view.season.startsAt) * view.config.throneUnlockFraction;
  return (
    <div className={styles.split}>
      <section className={styles.panel}>
        <h2>عرش تحدي</h2>
        <p className={styles.muted}>
          تتحول موارد مملكتك إلى رصيد للعرش في المرحلة الأخيرة من الموسم. وازن بين نمو القرى وقوة
          الجيش ومساهمة التحالف.
        </p>
        <p className={styles.cost}>
          كل نقطة عهد تحتاج إلى وحدة من كل مورد أساسي و{1 / view.config.throneGoldWeight} ذهب. قدّم
          مساهمة متوازنة؛ الموارد الزائدة لا تزيد رصيد العرش.
        </p>
        <p>
          رصيد عرشك: <strong>{number(view.player?.throne ?? 0)}</strong>
        </p>
        <p className={styles.cost}>تُفتح المساهمات: {new Date(unlock).toLocaleString('ar-SA')}</p>
        <CommandForm
          busy={busy || view.serverNow < unlock || view.season.status === 'ended'}
          label="ساهم في العرش"
          onSubmit={(form) =>
            void send({ type: 'throne', villageId: village.id, resources: amounts(form, 'throne') })
          }
        >
          <ResourceFields prefix="throne" title="مساهمة القرية المختارة" />
        </CommandForm>
      </section>
      <section className={styles.panel}>
        <h2>لوحة الممالك</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">المملكة</th>
                <th scope="col">القرى</th>
                <th scope="col">النقاط</th>
                <th scope="col">العرش</th>
              </tr>
            </thead>
            <tbody>
              {view.leaderboard.map((player) => (
                <tr key={player.id}>
                  <th scope="row">{player.name}</th>
                  <td>{number(player.villages)}</td>
                  <td>{number(player.score)}</td>
                  <td>{number(player.throne)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

'use client';

import { useId } from 'react';
import { Button } from '@/components/ui';
import { storageCapacity } from '@/lib/kingdoms/simulation';
import { resourceKeys } from '@/lib/kingdoms/types';
import { date, number, ResourceText, type GameProps } from './shared';
import styles from './alliance-event-card.module.css';

export function AllianceEventCard({ view, village, busy, send }: GameProps) {
  const id = useId();
  const event = view.allianceEvent;
  if (!event) return null;

  const member = Boolean(event.allianceId && event.allianceId === view.player?.allianceId);
  const ended = view.season.status === 'ended' || view.serverNow >= event.endsAt;
  const capacity = storageCapacity(view.config, village);
  const fits = resourceKeys.every((key) => village.resources[key] + event.reward[key] <= capacity);
  const reason = event.claimed
    ? 'استلمت مكافأة هذا الميثاق.'
    : ended
      ? 'انتهى وقت هذا الميثاق.'
      : view.paused
        ? 'العالم متوقف مؤقتًا.'
        : event.lockedToOtherAlliance
          ? 'مساهمتك لهذا الأسبوع مرتبطة بتحالفك السابق.'
          : !member
            ? 'أنشئ تحالفًا أو اطلب الانضمام من اللوحة أدناه للمشاركة في الميثاق.'
            : view.serverNow < event.startsAt
              ? 'لم يبدأ وقت هذا الميثاق بعد.'
              : event.points < event.target
                ? 'أكملوا هدف التحالف لفتح المكافأة لكل عضو ساهم.'
                : event.ownPoints === 0
                  ? 'ساهم بنقطة واحدة على الأقل لاستحقاق المكافأة.'
                  : !fits
                    ? `لا تتسع مخازن ${village.name} للمكافأة. أنفق بعض الموارد أو اختر قرية أخرى.`
                    : !event.canClaim
                      ? 'المكافأة غير متاحة الآن. حدّث الصفحة للتحقق من أهليتك.'
                      : null;
  const disabled = busy || reason !== null;

  return (
    <section className={styles.covenant} aria-label="الميثاق الأسبوعي للتحالف">
      <div className={styles.main}>
        <div className={styles.meta}>
          <span>الميثاق الأسبوعي · الأسبوع {number(event.week + 1)}</span>
          <span className={styles.state}>
            {event.claimed
              ? 'المكافأة مستلمة'
              : ended
                ? 'انتهى'
                : event.points >= event.target
                  ? 'اكتمل هدف التحالف'
                  : 'تحدٍّ مشترك'}
          </span>
        </div>
        <h2 id={`${id}-title`}>{event.title}</h2>
        <p className={styles.description}>{event.description}</p>
        <p className={styles.deadline}>
          ينتهي: <time dateTime={new Date(event.endsAt).toISOString()}>{date(event.endsAt)}</time>
        </p>
        <div className={styles.progressHead}>
          <label htmlFor={`${id}-progress`}>تقدّم التحالف في الميثاق</label>
          <strong>
            {number(event.points)} / {number(event.target)} <span>نقطة</span>
          </strong>
        </div>
        <progress
          id={`${id}-progress`}
          className={styles.progress}
          value={Math.min(event.points, event.target)}
          max={event.target}
        />
        <p className={styles.detail}>
          مساهمتك: {number(event.ownPoints)} من {number(event.memberCap)} نقطة في هذا الأسبوع.
        </p>
        <p className={styles.detail}>
          {event.theme === 'trade'
            ? 'تُحتسب التبادلات المكتملة خلال هذا الأسبوع مع شركاء مختلفين.'
            : 'تُحتسب الأعمال التي تبدأ وتكتمل خلال هذا الأسبوع وأنت عضو في التحالف.'}{' '}
          ترتبط مساهمتك بأول تحالف تساهم معه هذا الأسبوع.
        </p>
        <div className={styles.contributors}>
          <h3>صنّاع الميثاق</h3>
          {event.contributors.length ? (
            <ul>
              {event.contributors.map((contributor) => (
                <li key={contributor.id}>
                  <span>{contributor.name}</span>
                  <strong>{number(contributor.points)} نقطة</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.detail}>
              {member
                ? 'ابدأوا أول مساهمة؛ يحتاج الميثاق إلى تعاون أكثر من عضو.'
                : 'تظهر هنا مساهمات أعضاء تحالفك بعد الانضمام.'}
            </p>
          )}
        </div>
      </div>
      <aside className={styles.reward} aria-label="مكافأة الميثاق">
        <p className={styles.rewardLabel}>نصيب كل عضو ساهم</p>
        <ResourceText resources={event.reward} />
        <p className={styles.destination}>
          تصل المكافأة إلى <strong>{village.name}</strong>.
        </p>
        <Button
          variant="gold"
          disabled={disabled}
          loading={busy}
          aria-describedby={`${id}-reason`}
          onClick={() =>
            void send({
              type: 'allianceEventClaim',
              villageId: village.id,
              eventKey: event.eventKey,
            })
          }
        >
          استلم مكافأة الميثاق
        </Button>
        <p id={`${id}-reason`} className={styles.detail} role="status">
          {busy
            ? 'جارٍ إرسال الطلب…'
            : (reason ?? 'الهدف مكتمل. استلم مكافأتك مرة واحدة قبل نهاية الميثاق.')}
        </p>
      </aside>
    </section>
  );
}

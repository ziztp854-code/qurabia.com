'use client';
import { formatNumber } from '@/lib/utils';

import { Radar } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AudienceSnapshot } from '@/lib/presence/audience';
import styles from './audience-radar.module.css';

type RefreshState = 'idle' | 'loading' | 'error';

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  const part = (number: number) =>
    formatNumber(number, { minimumIntegerDigits: 2, useGrouping: false });
  return `${part(date.getUTCHours())}:${part(date.getUTCMinutes())}:${part(date.getUTCSeconds())} UTC`;
}

export function AudienceRadar({ initial }: { initial: AudienceSnapshot | null }) {
  // React 19 idiom for "store information from previous renders" — when the
  // parent hands us a new `initial` we mirror it into local state during
  // render itself, which avoids the `set-state-in-effect` and `refs-during-
  // render` rules that reject both `useEffect(setState, [prop])` and
  // `useRef(prop)` read patterns.
  const [snapshot, setSnapshot] = useState(initial);
  const [prevInitial, setPrevInitial] = useState(initial);
  const [refreshState, setRefreshState] = useState<RefreshState>(initial ? 'idle' : 'error');
  if (prevInitial !== initial) {
    setPrevInitial(initial);
    setSnapshot(initial);
    setRefreshState(initial ? 'idle' : 'error');
  }

  useEffect(() => {
    const poll = async () => {
      setRefreshState('loading');
      try {
        const response = await fetch('/api/admin/audience', { cache: 'no-store' });
        if (!response.ok) throw new Error('Audience refresh failed');
        const payload = (await response.json()) as AudienceSnapshot & { ok?: boolean };
        if (payload.ok === false) throw new Error('Audience refresh failed');
        setSnapshot(payload);
        setRefreshState('idle');
      } catch {
        setRefreshState('error');
      }
    };

    const timer = window.setInterval(() => {
      void poll();
    }, 20_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className={styles.radar} aria-label="رادار الجمهور">
      <div className={styles.dish}>
        <div className={styles.scope}>
          <span className={styles.sweep} aria-hidden="true" />
          <span className={styles.blip} aria-hidden="true" />
          <span className={styles.blip} aria-hidden="true" />
          <span className={styles.blip} aria-hidden="true" />
          <div className={styles.core} aria-label="متصفحات متصلة">
            <strong>{snapshot ? formatNumber(snapshot.presentNow) : '—'}</strong>
            <span>متصفحات متصلة</span>
          </div>
        </div>
      </div>
      <div className={styles.copy}>
        <span className={styles.eyebrow}>
          <Radar aria-hidden="true" />
          رادار الجمهور
        </span>
        <h2>نبض المنصة الحي</h2>
        <p>
          أرقام حقيقية من المتصفحات المفتوحة الآن، وزوّار اليوم، والمشاركين داخل الغرف الحيّة.
          لا توجد تقديرات تجريبية.
        </p>
        <div className={styles.metrics}>
          <article className={styles.metric}>
            <strong>{snapshot ? formatNumber(snapshot.uniqueToday) : '—'}</strong>
            <span>زائرًا فريدًا اليوم</span>
          </article>
          <article className={styles.metric}>
            <strong>{snapshot ? formatNumber(snapshot.viewsToday) : '—'}</strong>
            <span>زيارة جلسة اليوم</span>
          </article>
          <article className={styles.metric} aria-label="متصلون داخل غرفة حيّة">
            <strong>{snapshot ? formatNumber(snapshot.livePlayers) : '—'}</strong>
            <span>متصلون داخل غرفة حيّة</span>
          </article>
          <article className={styles.metric}>
            <strong>{snapshot ? formatNumber(snapshot.recentLogins) : '—'}</strong>
            <span>تسجيل دخول خلال 24 ساعة</span>
          </article>
        </div>
        {refreshState === 'loading' ? (
          <p className={styles.footnote} role="status" aria-live="polite">
            جارٍ تحديث بيانات الحضور.
          </p>
        ) : refreshState === 'error' || !snapshot ? (
          <p className={styles.footnote} role="alert">
            تعذر تحديث بيانات الحضور.
          </p>
        ) : snapshot.presentNow === 0 && snapshot.livePlayers === 0 ? (
          <p className={styles.footnote} role="status">
            لا توجد متصفحات متصلة أو مشاركون داخل غرفة حيّة الآن.
          </p>
        ) : (
          <p className={styles.footnote} role="status">
            آخر تحديث: {formatUpdatedAt(snapshot.updatedAt)}
          </p>
        )}
      </div>
    </section>
  );
}

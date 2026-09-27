'use client';

import { useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Activity,
  ArrowUpLeft,
  CircleAlert,
  Database,
  MonitorDot,
  Radio,
  RefreshCw,
  Users,
} from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import type { MonitoringSnapshot } from '@/lib/admin/monitor';
import styles from './monitor-dashboard.module.css';

const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString('ar-SA-u-nu-latn', {
    timeZone: 'Asia/Riyadh',
    hour: '2-digit',
    minute: '2-digit',
  });

const showNumber = (value: number | null) => (value === null ? '—' : formatNumber(value));

export function MonitorDashboard({ snapshot }: { snapshot: MonitoringSnapshot }) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) startTransition(() => router.refresh());
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [router]);

  const realtime = snapshot.services.realtime;
  const hasAudience = snapshot.audience !== null;
  const serviceResponsive = realtime.status === 'responsive';

  return (
    <div className={styles.dashboard} aria-label="مراقبة الموقع">
      <header className={styles.heading}>
        <div>
          <span className={styles.kicker}>
            <MonitorDot aria-hidden="true" /> لوحة المراقبة
          </span>
          <h1>نبض الموقع</h1>
          <p>الحضور والغرف واستجابة الخدمات من مصادر الموقع الحالية.</p>
        </div>
        <div className={styles.headingActions}>
          <span className={styles.updated} role="status">
            آخر تحديث <time dateTime={snapshot.updatedAt}>{formatTime(snapshot.updatedAt)}</time>
          </span>
          <button
            type="button"
            className={styles.refresh}
            onClick={() => startTransition(() => router.refresh())}
            disabled={refreshing}
          >
            <RefreshCw aria-hidden="true" /> {refreshing ? 'جارٍ التحديث' : 'تحديث الآن'}
          </button>
        </div>
      </header>

      <div className={styles.columns}>
        <div className={styles.mainColumn}>
          <section className={styles.audiencePanel} aria-labelledby="monitor-audience-title">
            <div className={styles.panelHeading}>
              <div>
                <span className={styles.eyebrow}>
                  <Activity aria-hidden="true" /> الحضور الآن
                </span>
                <h2 id="monitor-audience-title">الجمهور في الموقع</h2>
              </div>
              <span className={hasAudience ? styles.livePill : styles.unavailablePill}>
                {hasAudience ? 'بيانات متاحة' : 'البيانات غير متاحة'}
              </span>
            </div>
            <div className={styles.audienceNumber}>
              <strong>{hasAudience ? formatNumber(snapshot.audience!.presentNow) : '—'}</strong>
              <span>متصفحًا متصلًا الآن</span>
            </div>
            <div className={styles.metricRow}>
              <div>
                <strong>{hasAudience ? formatNumber(snapshot.audience!.uniqueToday) : '—'}</strong>
                <span>زائر فريد اليوم</span>
              </div>
              <div>
                <strong>{hasAudience ? formatNumber(snapshot.audience!.viewsToday) : '—'}</strong>
                <span>زيارة اليوم</span>
              </div>
              <div>
                <strong>{showNumber(snapshot.rooms.livePlayers)}</strong>
                <span>لاعب مسجل متصل بالغرف</span>
              </div>
            </div>
            <p className={styles.sourceNote}>
              {!snapshot.audience
                ? 'تعذر قراءة الحضور الآن. حاول تحديث اللوحة بعد قليل.'
                : snapshot.audience.source === 'memory'
                  ? 'الحضور من ذاكرة الخادم الحالي؛ قد لا يشمل بقية نسخ الموقع.'
                  : 'الحضور من سجل الزيارات المشترك. اتصال اللاعبين حسب الحالة المسجلة وقد يتأخر تحديثها.'}
            </p>
          </section>

          <section className={styles.roomsPanel} aria-labelledby="monitor-rooms-title">
            <div className={styles.panelHeading}>
              <div>
                <span className={styles.eyebrow}>
                  <Radio aria-hidden="true" /> اللعب المباشر
                </span>
                <h2 id="monitor-rooms-title">الغرف القائمة</h2>
              </div>
              <Link href="/admin/rooms" className={styles.textLink}>
                عرض الغرف <ArrowUpLeft aria-hidden="true" />
              </Link>
            </div>
            {snapshot.rooms.recent?.length ? (
              <div className={styles.roomList}>
                {snapshot.rooms.recent.map((room) => (
                  <article className={styles.room} key={room.id}>
                    <div className={styles.roomIdentity}>
                      <strong>{room.title}</strong>
                      <small dir="ltr">{room.code}</small>
                    </div>
                    <span className={styles.roomState}>
                      {room.status === 'ACTIVE' ? 'نشطة' : 'بانتظار اللاعبين'}
                    </span>
                    <span className={styles.roomPlayers}>
                      <Users aria-hidden="true" /> {formatNumber(room.participants)} متصل
                    </span>
                  </article>
                ))}
              </div>
            ) : snapshot.rooms.recent === null ? (
              <p className={styles.empty}>تعذر قراءة الغرف الآن.</p>
            ) : (
              <p className={styles.empty}>لا توجد غرف مباشرة حاليًا.</p>
            )}
            <p className={styles.sourceNote}>
              تعرض هذه القائمة غرف المسابقات المباشرة المسجلة؛ بعض أنماط اللعب الأخرى لها مصادر
              منفصلة.
            </p>
          </section>
        </div>

        <aside className={styles.sideColumn} aria-label="المؤشرات والخدمات">
          <div className={styles.summaryGrid}>
            <article className={styles.summary}>
              <span>غرف قائمة</span>
              <strong>{showNumber(snapshot.rooms.active)}</strong>
              <small>نشطة أو بانتظار اللاعبين</small>
            </article>
            <article className={styles.summary}>
              <span>غرف جديدة</span>
              <strong>{showNumber(snapshot.rooms.created24h)}</strong>
              <small>خلال آخر 24 ساعة</small>
            </article>
            <article className={styles.summary}>
              <span>حسابات جديدة</span>
              <strong>{showNumber(snapshot.newUsers24h)}</strong>
              <small>خلال آخر 24 ساعة</small>
            </article>
          </div>

          <section className={styles.healthPanel} aria-labelledby="monitor-health-title">
            <div className={styles.panelHeading}>
              <div>
                <span className={styles.eyebrow}>الخدمات</span>
                <h2 id="monitor-health-title">حالة الاستجابة</h2>
              </div>
            </div>
            <div className={styles.healthList}>
              <div className={styles.healthItem}>
                <MonitorDot aria-hidden="true" />
                <div>
                  <strong>الصفحة الرئيسية</strong>
                  <small>استجابة الطلب من الخادم</small>
                </div>
                <span
                  className={
                    snapshot.services.web.status === 'responsive'
                      ? styles.goodState
                      : styles.badState
                  }
                >
                  {snapshot.services.web.status === 'responsive'
                    ? `تستجيب · ${formatNumber(snapshot.services.web.latencyMs ?? 0)} مللي ثانية`
                    : snapshot.services.web.status === 'unconfigured'
                      ? 'غير مهيأة'
                      : 'لا تستجيب'}
                </span>
              </div>
              <div className={styles.healthItem}>
                <Database aria-hidden="true" />
                <div>
                  <strong>قاعدة البيانات</strong>
                  <small>استعلام مؤشرات اللوحة</small>
                </div>
                <span
                  className={
                    snapshot.services.databaseStatus === 'available'
                      ? styles.goodState
                      : styles.badState
                  }
                >
                  {snapshot.services.databaseStatus === 'available'
                    ? `متاحة · ${showNumber(snapshot.services.databaseQueryMs)} مللي ثانية`
                    : 'تعذر قراءة المؤشرات'}
                </span>
              </div>
              <div className={styles.healthItem}>
                <Radio aria-hidden="true" />
                <div>
                  <strong>خدمة اللعب المباشر</strong>
                  <small>استجابة مسار الخدمة فقط</small>
                </div>
                <span className={serviceResponsive ? styles.goodState : styles.badState}>
                  {serviceResponsive
                    ? `تستجيب · ${formatNumber(realtime.latencyMs ?? 0)} مللي ثانية`
                    : realtime.status === 'unconfigured'
                      ? 'غير مهيأة'
                      : 'لا تستجيب'}
                </span>
              </div>
            </div>
          </section>

          <section className={styles.errorsPanel} aria-labelledby="monitor-errors-title">
            <div className={styles.panelHeading}>
              <div>
                <span className={styles.eyebrow}>
                  <CircleAlert aria-hidden="true" /> الأعطال
                </span>
                <h2 id="monitor-errors-title">تتبع الأخطاء</h2>
              </div>
              <span
                className={
                  snapshot.errors.status === 'available' ? styles.livePill : styles.unavailablePill
                }
              >
                {snapshot.errors.status === 'available'
                  ? 'قراءة متاحة'
                  : snapshot.errors.status === 'unconfigured'
                    ? 'القراءة غير مهيأة'
                    : 'تعذر الاتصال'}
              </span>
            </div>
            <p>
              التقاط أخطاء الخادم: {snapshot.services.errorCapture.server ? 'مهيأ' : 'غير مهيأ'} ·
              المتصفح: {snapshot.services.errorCapture.browser ? 'مهيأ' : 'غير مهيأ'}.
            </p>
            {snapshot.errors.status === 'available' && snapshot.errors.issues.length ? (
              <ul className={styles.issueList}>
                {snapshot.errors.issues.map((issue) => (
                  <li key={issue.id}>
                    <div>
                      <small dir="ltr">{issue.code}</small>
                      <strong>
                        مشكلة مفتوحة
                        {issue.lastSeen ? ` · آخر ظهور ${formatTime(issue.lastSeen)}` : ''}
                      </strong>
                    </div>
                    {issue.url ? (
                      <a
                        href={issue.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`افتح ${issue.code} في Sentry`}
                      >
                        <ArrowUpLeft aria-hidden="true" />
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.empty}>
                {snapshot.errors.status === 'available'
                  ? 'لا توجد مشكلات مفتوحة في هذا المشروع.'
                  : snapshot.errors.status === 'unconfigured'
                    ? 'تحتاج قراءة المشكلات إلى ربط حساب Sentry.'
                    : 'تعذر تحميل المشكلات من Sentry الآن.'}
              </p>
            )}
          </section>
          <Link href="/admin/reports" className={styles.reportLink}>
            افتح تقارير النشاط <ArrowUpLeft aria-hidden="true" />
          </Link>
        </aside>
      </div>
    </div>
  );
}

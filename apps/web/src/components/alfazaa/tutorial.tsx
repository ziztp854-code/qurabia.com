'use client';
import { BookOpen, Check, ChevronLeft, Flag, X } from 'lucide-react';
import type { AlfazaaState } from '@/lib/alfazaa/domain/types';
import { tutorialProgress, type TutorialSection } from './tutorial-model';
import styles from './tutorial.module.css';

export interface TutorialProps {
  state: AlfazaaState;
  onNavigate: (tab: TutorialSection) => void;
  open: boolean;
  onClose: () => void;
}

export function Tutorial({ state, onNavigate, open, onClose }: TutorialProps) {
  if (!open) return null;
  const progress = tutorialProgress(state);
  const current = progress.current;
  return (
    <aside className={styles.guide} dir="rtl" aria-label="مرشد الفزعة">
      <header className={styles.header}>
        <span className={styles.emblem} aria-hidden="true">
          <BookOpen size={23} />
        </span>
        <div>
          <span className={styles.caption}>خطوتك الأولى في الفزعة</span>
          <h2>دليل القائد</h2>
        </div>
        <span
          className={styles.count}
          dir="ltr"
          aria-label={`${progress.completedCount} من 6 خطوات مكتملة`}
        >
          {progress.completedCount} / 6
        </span>
        <button className={styles.close} onClick={onClose} aria-label="إغلاق الإرشادات">
          <X size={18} />
        </button>
      </header>
      <div
        className={styles.meter}
        role="progressbar"
        aria-label="تقدّم دليل القائد"
        aria-valuemin={0}
        aria-valuemax={6}
        aria-valuenow={progress.completedCount}
      >
        <span style={{ width: `${(progress.completedCount / 6) * 100}%` }} />
      </div>
      {current ? (
        <div className={styles.current}>
          <span className={styles.stepNumber} aria-hidden="true">
            {progress.steps.findIndex((step) => step.id === current.id) + 1}
          </span>
          <div className={styles.instruction}>
            <h3 role="status" aria-live="polite">
              {current.title}
            </h3>
            <p>{current.instruction}</p>
          </div>
          <button className={styles.action} onClick={() => onNavigate(current.section)}>
            {current.actionLabel}
            <ChevronLeft size={17} />
          </button>
        </div>
      ) : (
        <div className={styles.finished}>
          <Flag size={27} aria-hidden="true" />
          <div>
            <h3 role="status">أكملت خطوات البداية</h3>
            <p>مدينتك جاهزة. تابع تطوير الجيش واستكشف ساحات التدريب الأخرى.</p>
          </div>
          <button className={styles.action} onClick={() => onNavigate('training')}>
            استكشف المراحل
            <ChevronLeft size={17} />
          </button>
        </div>
      )}
      <details className={styles.details}>
        <summary>عرض الخطوات الست وتعليمات القتال</summary>
        <ol className={styles.steps}>
          {progress.steps.map((step, index) => (
            <li key={step.id} className={step.done ? styles.done : undefined}>
              <span className={styles.marker} aria-hidden="true">
                {step.done ? <Check size={16} /> : index + 1}
              </span>
              <div>
                <h3>
                  {step.title}
                  <small>{step.done ? 'مكتملة' : 'لم تكتمل بعد'}</small>
                </h3>
                <p>{step.instruction}</p>
                <button
                  className={styles.stepLink}
                  onClick={() => onNavigate(step.section)}
                  aria-label={`عرض موضع خطوة ${step.title}`}
                >
                  عرض موضع الخطوة
                  <ChevronLeft size={14} />
                </button>
              </div>
            </li>
          ))}
        </ol>
        <div className={styles.rules}>
          <h3>قبل إرسال جيشك</h3>
          <p>
            الأزرق يحدّد الأبراج التي تملكها. العدد عند كل برج هو عدد جنوده؛ إرسالهم يقلّل حامية
            المصدر حتى ينمو عددها مجددًا. لا يمكنك إصدار أوامر من برج الخصم أو برج محايد.
          </p>
          <p>
            اختر هدفًا يمكن الوصول إليه دون عبور حاجز، وغيّر مساراتك حسب المعركة. لإيقاف الإرسال
            استخدم زر إيقاف المسار، ولإعادة المحاولة اضغط إعادة المحاولة.
          </p>
          <p>
            المراحل الـ65 متاحة كتدريب فردي. الفوز يُسجَّل في تقدّم المراحل، دون عملات أو مكافآت
            مالية أو نقاط ترتيب.
          </p>
        </div>
      </details>
    </aside>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { Flag } from 'lucide-react';
import { Button } from '@/components/ui';
import type { VillageTarget } from '@/lib/kingdoms/village/types';
import styles from './village-scene.module.css';

const tour = [
  { target: 'hall', title: 'دار الحكم', text: 'هذه عاصمتك، ومن هنا تدير المملكة.' },
  { target: 'farm', title: 'مزارع الغذاء', text: 'المزارع توفر الغذاء لسكانك وجيشك.' },
  { target: 'barracks', title: 'الثكنة', text: 'درّب جيشك واستعد للدفاع والتوسع.' },
  { target: 'gate', title: 'البوابة الرئيسية', text: 'اخرج إلى خريطة العالم وابدأ التوسع.' },
] satisfies ReadonlyArray<{ target: VillageTarget; title: string; text: string }>;

async function readCompletion(init?: RequestInit): Promise<boolean> {
  const result = await fetch('/api/kingdoms/village-onboarding', { cache: 'no-store', ...init });
  const payload = await result.json();
  if (!result.ok || payload?.success !== true || typeof payload.data?.completed !== 'boolean') {
    throw new Error('تعذر حفظ الجولة. تحقق من اتصالك وأعد المحاولة.');
  }
  return payload.data.completed;
}

export function VillageOnboarding({
  accountId,
  ready,
  focus,
  onComplete,
}: {
  accountId: string;
  ready: boolean;
  focus: (target: VillageTarget) => void;
  onComplete?: () => void;
}) {
  const [step, setStep] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void readCompletion({ signal: controller.signal })
      .then((completed) => {
        if (!controller.signal.aborted) {
          setStep(completed ? null : 0);
          setError('');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError('تعذر تحميل جولة القرية. أعد المحاولة عندما يعود الاتصال.');
      });
    return () => controller.abort();
  }, [accountId, reload]);
  useEffect(() => {
    if (ready && step !== null) focus(tour[step].target);
  }, [focus, ready, step]);
  async function finish() {
    setSaving(true);
    setError('');
    try {
      const completed = await readCompletion({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: true }),
      });
      if (!completed) throw new Error('تعذر حفظ الجولة.');
      setStep(null);
      onComplete?.();
    } catch {
      setError('تعذر حفظ الجولة. تحقق من اتصالك وأعد المحاولة.');
    } finally {
      setSaving(false);
    }
  }
  if (!ready) return null;
  if (step === null)
    return error ? (
      <div className={styles.tourError}>
        <p role="alert">{error}</p>
        <Button variant="outline" onClick={() => setReload((value) => value + 1)}>
          أعد تحميل الجولة
        </Button>
      </div>
    ) : null;
  const current = tour[step];
  return (
    <section aria-label="جولة القرية" className={styles.tour}>
      <div className={styles.tourTitle}>
        <Flag size={20} aria-hidden="true" />
        <strong>{current.title}</strong>
        <span>
          {step + 1} / {tour.length}
        </span>
      </div>
      <p aria-live="polite">{current.text}</p>
      {error && <p role="alert">{error}</p>}
      <div className={styles.tourActions}>
        <Button
          disabled={saving}
          onClick={() => (error || step === tour.length - 1 ? void finish() : setStep(step + 1))}
        >
          {saving
            ? 'جارٍ الحفظ…'
            : error
              ? 'أعد حفظ الجولة'
              : step === tour.length - 1
                ? 'ابدأ اللعب'
                : 'التالي'}
        </Button>
        {step < tour.length - 1 && (
          <Button variant="ghost" disabled={saving} onClick={() => void finish()}>
            إنهاء الجولة
          </Button>
        )}
      </div>
    </section>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { Activity, CheckCircle2, CircleAlert, Info } from 'lucide-react';
import type { VoiceCheckRow } from './voice-connection-report';
import styles from './voice-enhancements.module.css';

export function VoiceConnectionCheck({ inspect }: { inspect: () => Promise<VoiceCheckRow[]> }) {
  const [results, setResults] = useState<VoiceCheckRow[]>([]);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  const running = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function run() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      const rows = await inspect();
      if (mounted.current) setResults(rows);
    } catch {
      if (mounted.current)
        setResults([
          { label: 'الفحص', state: 'warning', detail: 'تعذر إتمام الفحص. حاول مجددًا.' },
        ]);
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section className={styles.connectionCheck} aria-label="فحص اتصال الغرفة">
      <button type="button" disabled={busy} onClick={() => void run()}>
        <Activity size={18} aria-hidden="true" /> {busy ? 'جارٍ فحص الاتصال…' : 'فحص اتصال الغرفة'}
      </button>
      <div role="status" aria-live="polite" aria-atomic="true">
        {busy ? (
          <p>نقرأ حالة اتصالك وإحصاءات الصوت…</p>
        ) : (
          results.length > 0 && (
            <>
              <ul className={styles.checkResults}>
                {results.map((result) => (
                  <li key={result.label} data-state={result.state}>
                    {result.state === 'passed' ? (
                      <CheckCircle2 size={18} aria-hidden="true" />
                    ) : result.state === 'info' ? (
                      <Info size={18} aria-hidden="true" />
                    ) : (
                      <CircleAlert size={18} aria-hidden="true" />
                    )}
                    <div>
                      <strong>{result.label}</strong>
                      <p>{result.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <p>هذه نتيجة لحظة الفحص. تأكيد وصول صوتك يحتاج عضوًا آخر يسمعك.</p>
            </>
          )
        )}
      </div>
    </section>
  );
}

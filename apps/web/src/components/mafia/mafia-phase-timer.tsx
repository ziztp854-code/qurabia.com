'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Clock3, FastForward } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { MafiaPhaseName } from '@/lib/mafia/guidance';
import { mafiaPhaseGuides } from '@/lib/mafia/guidance';
import { mafiaPhaseLabels } from '@/lib/mafia/rules';
import { formatNumber } from '@/lib/utils';

const MAX_TRANSITION_RETRIES = 3;
const TRANSITION_RETRY_BASE_DELAY_MS = 1_000;
const PERMANENT_TRANSITION_FAILURES = new Set([401, 403, 404]);

export function formatMafiaCountdown(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  const options = { minimumIntegerDigits: 2, useGrouping: false };
  return `${formatNumber(minutes, options)}:${formatNumber(seconds, options)}`;
}

export function MafiaPhaseTimer({
  phase,
  phaseEndsAt,
  durationSeconds,
  autoMode,
  tickEndpoint,
  participantId,
}: {
  phase: MafiaPhaseName;
  phaseEndsAt: string | null;
  durationSeconds: number | null;
  autoMode: boolean;
  tickEndpoint: string;
  participantId?: string;
}) {
  const router = useRouter();
  const deadline = phaseEndsAt ? Date.parse(phaseEndsAt) : null;
  const [now, setNow] = useState(() =>
    deadline && durationSeconds ? deadline - durationSeconds * 1_000 : 0,
  );
  const [transitionRetry, setTransitionRetry] = useState(0);
  const requestedDeadline = useRef<string | null>(null);
  const retryAttempts = useRef(0);
  const remainingSeconds = deadline ? Math.max(0, Math.ceil((deadline - now) / 1_000)) : 0;
  const progress =
    deadline && durationSeconds
      ? Math.max(0, Math.min(100, (remainingSeconds / durationSeconds) * 100))
      : 0;
  const startTime = useMemo(
    () =>
      deadline && durationSeconds
        ? new Date(deadline - durationSeconds * 1_000).toLocaleTimeString('ar-SA-u-nu-latn', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })
        : null,
    [deadline, durationSeconds],
  );
  const endTime = useMemo(
    () =>
      deadline
        ? new Date(deadline).toLocaleTimeString('ar-SA-u-nu-latn', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })
        : null,
    [deadline],
  );

  useEffect(() => {
    if (!deadline || !autoMode) return;
    const initialSync = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => {
      window.clearTimeout(initialSync);
      window.clearInterval(timer);
    };
  }, [autoMode, deadline]);

  useEffect(() => {
    requestedDeadline.current = null;
    retryAttempts.current = 0;
  }, [phaseEndsAt]);

  useEffect(() => {
    if (
      !autoMode ||
      !phaseEndsAt ||
      remainingSeconds > 0 ||
      requestedDeadline.current === phaseEndsAt
    ) {
      return;
    }
    requestedDeadline.current = phaseEndsAt;
    const controller = new AbortController();
    let retryTimer: number | null = null;
    const scheduleRetry = (status?: number) => {
      if (
        controller.signal.aborted ||
        (status && PERMANENT_TRANSITION_FAILURES.has(status)) ||
        retryAttempts.current >= MAX_TRANSITION_RETRIES
      ) {
        return;
      }
      const retryDelay = TRANSITION_RETRY_BASE_DELAY_MS * Math.pow(2, retryAttempts.current);
      retryAttempts.current += 1;
      requestedDeadline.current = null;
      retryTimer = window.setTimeout(
        () => setTransitionRetry((attempt) => attempt + 1),
        retryDelay,
      );
    };
    void fetch(tickEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ participantId }),
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((response) => {
        if (response.ok) {
          retryAttempts.current = 0;
          router.refresh();
          return;
        }
        scheduleRetry(response.status);
      })
      .catch(() => scheduleRetry());
    return () => {
      controller.abort();
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [
    autoMode,
    participantId,
    phaseEndsAt,
    remainingSeconds,
    router,
    tickEndpoint,
    transitionRetry,
  ]);

  if (!autoMode || !deadline || !durationSeconds) {
    return (
      <section className="mafia-phase-timer mafia-phase-timer-manual" aria-label="توقيت المرحلة">
        <Clock3 aria-hidden="true" />
        <div>
          <strong>الانتقال يدوي</strong>
          <span>ينقل المضيف اللعبة عندما تنتهي مناقشة المرحلة.</span>
        </div>
      </section>
    );
  }

  return (
    <section className="mafia-phase-timer" aria-label="العد التنازلي للمرحلة">
      <div className="mafia-timer-heading">
        <div>
          <span>المرحلة الحالية</span>
          <strong>{mafiaPhaseLabels[phase]}</strong>
        </div>
        <div className="mafia-timer-value" role="timer" aria-live="off">
          <Clock3 aria-hidden="true" />
          <span data-testid="mafia-countdown">{formatMafiaCountdown(remainingSeconds)}</span>
        </div>
      </div>
      <div
        className="mafia-timer-track"
        role="progressbar"
        aria-label="الوقت المتبقي"
        aria-valuemin={0}
        aria-valuemax={durationSeconds}
        aria-valuenow={remainingSeconds}
      >
        <span style={{ transform: `scaleX(${progress / 100})` }} />
      </div>
      <div className="mafia-timer-times">
        <span>بدأت {startTime}</span>
        <span>تنتهي {endTime}</span>
      </div>
      <p className="mafia-timer-next" aria-live="polite">
        <FastForward aria-hidden="true" />
        {remainingSeconds > 0
          ? `بعد الصفر: ${mafiaPhaseGuides[phase].next}`
          : 'انتهى الوقت، جارٍ الانتقال تلقائيًا…'}
      </p>
    </section>
  );
}

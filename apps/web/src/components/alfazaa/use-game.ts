'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createInitialState } from '@/lib/alfazaa/domain/state';
import { validateState } from '@/lib/alfazaa/domain/validation';
import type { AlfazaaState, Command } from '@/lib/alfazaa/domain/types';
import type { GameplaySnapshot } from '@/lib/alfazaa/realm/common';

const STORAGE = 'alfazaa-demo-v1';
class AccountError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
async function accountRequest(body?: object): Promise<{ state: AlfazaaState; world?: GameplaySnapshot['world'] }> {
  const response = await fetch(
    '/api/alfazaa',
    body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : { cache: 'no-store' },
  );
  const result = await response.json();
  if (!response.ok || !result.success)
    throw new AccountError(result.error || 'تعذّر الاتصال بحفظ الحساب.', response.status);
  const state = validateState(result.data?.state);
  if (!state) throw new Error('بيانات الحفظ غير صالحة. أعد تحميل الصفحة.');
  return { state, world: result.data?.world };
}

export function useGame(demo: boolean) {
  const [state, setState] = useState<AlfazaaState | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [world, setWorld] = useState<GameplaySnapshot['world']>();
  const pending = useRef(false);
  const unresolved = useRef<{
    idempotencyKey: string;
    expectedRevision: number;
    command: Command;
  } | null>(null);
  const current = useRef<AlfazaaState | null>(null);
  const alive = useRef(true);
  const commit = useCallback(
    (next: AlfazaaState) => {
      if (!alive.current) return;
      current.current = next;
      setState(next);
      if (demo) {
        try {
          localStorage.setItem(STORAGE, JSON.stringify(next));
        } catch {
          setError('تعذّر الحفظ على هذا الجهاز. اسمح بالتخزين لتحتفظ بتقدّمك.');
        }
      }
    },
    [demo],
  );
  const reload = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      if (demo) {
        const stored = localStorage.getItem(STORAGE);
        if (!stored) commit(createInitialState(Date.now()));
        else {
          let restored: AlfazaaState | null = null;
          try { restored = validateState(JSON.parse(stored)); } catch { /* Preserve the original for recovery. */ }
          if (!restored) throw new Error('تعذّر استعادة الحفظ المحلي. احتفظ ببياناته لاسترداد التقدّم؛ لم يُحذف الحفظ.');
          const { advanceState } = await import('@/lib/alfazaa/domain/city');
          commit(advanceState(restored, Date.now()));
        }
      } else {
        const result = await accountRequest();
        commit(result.state);
        setWorld(result.world);
        unresolved.current = null;
      }
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : 'تعذّر فتح اللعبة.');
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  }, [demo, commit]);
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void reload();
    });
    return () => {
      cancelled = true;
      alive.current = false;
    };
  }, [reload]);
  const send = useCallback(
    async (command: Command) => {
      if (!current.current || pending.current) return;
      if (unresolved.current && command !== unresolved.current.command) {
        setError('هناك طلب لم يصل تأكيده. أعد محاولته أو أعد المزامنة أولًا.');
        return;
      }
      pending.current = true;
      setBusy(true);
      setError('');
      try {
        if (demo) {
          const { applyCommand } = await import('@/lib/alfazaa/domain/city');
          const result = applyCommand(current.current, command, Date.now());
          if (result.ok) {
            commit(result.state);
            if (!['tower-tick', 'systems-tick'].includes(command.type)) setMessage(result.message || 'تم تنفيذ الأمر.');
          } else setError(result.message);
        } else {
          const body = unresolved.current || {
            idempotencyKey: crypto.randomUUID(),
            expectedRevision: current.current.revision,
            command,
          };
          unresolved.current = body;
          const result = await accountRequest(body);
          commit(result.state);
          setWorld(result.world);
          unresolved.current = null;
          if (!['tower-tick', 'systems-tick'].includes(command.type)) setMessage('تم حفظ الأمر في حسابك.');
        }
      } catch (cause) {
        if (cause instanceof AccountError && cause.status < 500) unresolved.current = null;
        if (alive.current) setError(cause instanceof Error ? cause.message : 'تعذّر تنفيذ الأمر.');
      } finally {
        pending.current = false;
        if (alive.current) setBusy(false);
      }
    },
    [demo, commit],
  );
  useEffect(() => {
    if (!state?.realm.systems.jobs.length || state.battle?.status === 'active') return;
    const timer = setInterval(() => void send({ type: 'systems-tick' }), 5000);
    return () => clearInterval(timer);
  }, [state?.realm.systems.jobs.length, state?.battle?.status, send]);
  useEffect(() => {
    if (state?.battle?.status !== 'active') return;
    const timer = setInterval(
      () => {
        void send({ type: 'tower-tick' });
      },
      demo ? 500 : 1500,
    );
    return () => clearInterval(timer);
  }, [state?.battle?.status, demo, send]);
  const retry = useCallback(async () => {
    if (unresolved.current) await send(unresolved.current.command);
  }, [send]);
  return { state, world, busy, error, message, send, reload, retry };
}

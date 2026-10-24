'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyCommand,
  createInitialState,
  validateState,
  type AlfazaaState,
  type Command,
} from '@/lib/alfazaa/domain';

const STORAGE = 'alfazaa-demo-v1';
class AccountError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
async function accountRequest(body?: object): Promise<AlfazaaState> {
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
  return state;
}

export function useGame(demo: boolean) {
  const [state, setState] = useState<AlfazaaState | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
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
        let restored: AlfazaaState | null = null;
        try {
          restored = validateState(JSON.parse(localStorage.getItem(STORAGE) || 'null'));
        } catch {
          /* Invalid guest saves are replaced by a new local game. */
        }
        commit(restored || createInitialState(Date.now()));
      } else {
        commit(await accountRequest());
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
          const result = applyCommand(current.current, command, Date.now());
          if (result.ok) {
            commit(result.state);
            if (command.type !== 'tower-tick') setMessage(result.message || 'تم تنفيذ الأمر.');
          } else setError(result.message);
        } else {
          const body = unresolved.current || {
            idempotencyKey: crypto.randomUUID(),
            expectedRevision: current.current.revision,
            command,
          };
          unresolved.current = body;
          commit(await accountRequest(body));
          unresolved.current = null;
          if (command.type !== 'tower-tick') setMessage('تم حفظ الأمر في حسابك.');
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
  return { state, busy, error, message, send, reload, retry };
}

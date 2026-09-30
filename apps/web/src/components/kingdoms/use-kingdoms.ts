'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { resolveRealtimeNamespaceUrl } from '@/components/special-games/realtime-url';
import type { KingdomsCommand } from '@/lib/kingdoms/commands';
import type { WorldView } from './shared';

export type WorldSummary = {
  id: string;
  name: string;
  revision: number;
  status: string;
  createdAt: string;
};
export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    const message = typeof payload?.error === 'string' ? payload.error : payload?.error?.message;
    throw new Error(message || 'تعذر الاتصال بالعالم. تحقق من الاتصال ثم أعد المحاولة.');
  }
  return payload.data as T;
}

export function useKingdoms() {
  const [worlds, setWorlds] = useState<WorldSummary[]>([]);
  const [worldId, updateWorldId] = useState('');
  const [view, setView] = useState<WorldView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef<{
    worldId: string;
    command: KingdomsCommand;
    idempotencyKey: string;
  } | null>(null);
  const mutating = useRef(false);
  const generation = useRef(0);
  const setWorldId = useCallback((id: string) => {
    generation.current += 1;
    setView(null);
    setLoading(Boolean(id));
    setError('');
    setNotice('');
    updateWorldId(id);
  }, []);
  const listWorlds = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await request<WorldSummary[]>('/api/kingdoms/worlds');
      setWorlds(result);
      updateWorldId((current) => current || result[0]?.id || '');
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    let current = true;
    void request<WorldSummary[]>('/api/kingdoms/worlds')
      .then((result) => {
        if (current) {
          setWorlds(result);
          updateWorldId(result[0]?.id || '');
          if (!result.length) setLoading(false);
        }
      })
      .catch((failure) => {
        if (current) {
          setError((failure as Error).message);
          setLoading(false);
        }
      });
    return () => {
      current = false;
    };
  }, []);
  const refresh = useCallback(async () => {
    if (!worldId || mutating.current) return;
    const version = generation.current;
    try {
      const result = await request<WorldView>(
        `/api/kingdoms?worldId=${encodeURIComponent(worldId)}`,
      );
      if (version === generation.current && !mutating.current) {
        setView((current) =>
          current?.worldId === result.worldId && current.serverNow > result.serverNow
            ? current
            : result,
        );
        setError('');
      }
    } catch (failure) {
      if (version === generation.current) setError((failure as Error).message);
    } finally {
      if (version === generation.current) setLoading(false);
    }
  }, [worldId]);
  useEffect(() => {
    if (!worldId) return;
    const version = generation.current;
    void request<WorldView>(`/api/kingdoms?worldId=${encodeURIComponent(worldId)}`)
      .then((result) => {
        if (version === generation.current && !mutating.current) {
          setView((current) =>
            current?.worldId === result.worldId && current.serverNow > result.serverNow
              ? current
              : result,
          );
          setError('');
        }
      })
      .catch((failure) => {
        if (version === generation.current) setError((failure as Error).message);
      })
      .finally(() => {
        if (version === generation.current) setLoading(false);
      });
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 15000);
    return () => {
      generation.current += 1;
      clearInterval(timer);
    };
  }, [refresh, worldId]);
  useEffect(() => {
    if (!worldId) return;
    const socket = io(
      resolveRealtimeNamespaceUrl(
        process.env.NEXT_PUBLIC_REALTIME_URL,
        window.location.origin,
        '/kingdoms',
      ),
      { transports: ['websocket', 'polling'], reconnectionAttempts: 3 },
    );
    socket.on('connect', () => socket.emit('kingdoms:watch', { worldId }));
    socket.on('kingdoms:revision', (event: { worldId: string }) => {
      if (event.worldId === worldId) void refresh();
    });
    return () => {
      socket.disconnect();
    };
  }, [refresh, worldId]);
  const send = useCallback(
    async (command: KingdomsCommand) => {
      if (mutating.current) return;
      mutating.current = true;
      generation.current += 1;
      setBusy(true);
      setError('');
      setNotice('');
      const previous = pending.current;
      const body =
        previous?.worldId === worldId &&
        JSON.stringify(previous.command) === JSON.stringify(command)
          ? previous
          : { worldId, command, idempotencyKey: crypto.randomUUID() };
      pending.current = body;
      try {
        const result = await request<WorldView>('/api/kingdoms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        setView(result);
        pending.current = null;
        setNotice('تم تنفيذ أمرك.');
      } catch (failure) {
        setError((failure as Error).message);
      } finally {
        mutating.current = false;
        setBusy(false);
      }
    },
    [worldId],
  );
  return {
    worlds,
    worldId,
    setWorldId,
    view,
    loading,
    busy,
    error,
    notice,
    refresh,
    listWorlds,
    send,
  };
}

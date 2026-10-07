'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { KingdomsCommand } from '@/lib/kingdoms/commands';
import type { WorldView } from '../shared';
import { request } from '../use-kingdoms';

/** Exact-world transport: never falls back to another campaign, and clears data on loss of access. */
export function useAbandonedWorld(worldId: string, viewerId: string) {
  const sessionKey = `${worldId}:${viewerId}`;
  const [snapshot, setSnapshot] = useState<{ sessionKey: string; view: WorldView | null } | null>(
      null,
    ),
    [failure, setFailure] = useState<{ sessionKey: string; message: string } | null>(null),
    [busy, setBusy] = useState(false);
  const generation = useRef(0),
    mutating = useRef(false);
  const pending = useRef<{
    worldId: string;
    command: KingdomsCommand;
    idempotencyKey: string;
  } | null>(null);
  const accept = useCallback(
    (incoming: WorldView) => {
      if (incoming.worldId !== worldId || incoming.player?.id !== viewerId)
        throw new Error('تعذر التحقق من صلاحية العالم.');
      setSnapshot((previous) => {
        const current = previous?.sessionKey === sessionKey ? previous.view : null;
        return {
          sessionKey,
          view:
            current &&
            current.worldId === worldId &&
            (current.revision > incoming.revision ||
              (current.revision === incoming.revision && current.serverNow > incoming.serverNow))
              ? current
              : incoming,
        };
      });
      setFailure(null);
    },
    [worldId, viewerId, sessionKey],
  );
  useEffect(() => {
    const version = ++generation.current,
      controller = new AbortController();
    pending.current = null;
    async function refresh() {
      if (mutating.current) return;
      try {
        const result = await request<WorldView>(
          `/api/kingdoms?worldId=${encodeURIComponent(worldId)}`,
          { signal: controller.signal },
        );
        if (version === generation.current && !mutating.current) accept(result);
      } catch (failure) {
        if (!controller.signal.aborted && version === generation.current) {
          setSnapshot({ sessionKey, view: null });
          setFailure({ sessionKey, message: (failure as Error).message });
        }
      }
    }
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 15000);
    return () => {
      generation.current = version + 1;
      controller.abort();
      clearInterval(timer);
    };
  }, [worldId, sessionKey, accept]);
  const send = useCallback(
    async (command: KingdomsCommand) => {
      if (mutating.current) return;
      const version = generation.current;
      mutating.current = true;
      setBusy(true);
      setFailure(null);
      const body =
        pending.current?.worldId === worldId &&
        JSON.stringify(pending.current.command) === JSON.stringify(command)
          ? pending.current
          : { worldId, command, idempotencyKey: crypto.randomUUID() };
      pending.current = body;
      try {
        const result = await request<WorldView>('/api/kingdoms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (version === generation.current) {
          accept(result);
          pending.current = null;
        }
      } catch (failure) {
        if (version === generation.current) {
          setSnapshot({ sessionKey, view: null });
          setFailure({ sessionKey, message: (failure as Error).message });
        }
      } finally {
        mutating.current = false;
        setBusy(false);
      }
    },
    [accept, worldId, sessionKey],
  );
  return {
    view: snapshot?.sessionKey === sessionKey ? snapshot.view : null,
    error: failure?.sessionKey === sessionKey ? failure.message : '',
    busy,
    send,
  };
}

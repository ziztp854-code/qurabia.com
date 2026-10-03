import { io } from 'socket.io-client';
import { resolveRealtimeNamespaceUrl } from '@/components/special-games/realtime-url';

/** Notifications carry no gameplay state; all updates use the authenticated viewport endpoint. */
export function watchMapRevisions(worldId: string, refresh: () => void): () => void {
  let closed = false;
  let revision = -1;
  const socket = io(
    resolveRealtimeNamespaceUrl(
      process.env.NEXT_PUBLIC_REALTIME_URL,
      window.location.origin,
      '/kingdoms',
    ),
    { transports: ['websocket', 'polling'], reconnectionAttempts: 3 },
  );
  socket.on('connect', () => {
    if (closed) return;
    socket.emit('kingdoms:watch', { worldId });
    refresh();
  });
  socket.on('kingdoms:revision', (event: unknown) => {
    if (closed || !event || typeof event !== 'object') return;
    const value = event as { worldId?: unknown; revision?: unknown };
    if (
      value.worldId !== worldId ||
      typeof value.revision !== 'number' ||
      !Number.isSafeInteger(value.revision) ||
      value.revision < 0 ||
      value.revision <= revision
    )
      return;
    revision = value.revision;
    refresh();
  });
  return () => {
    closed = true;
    socket.disconnect();
  };
}

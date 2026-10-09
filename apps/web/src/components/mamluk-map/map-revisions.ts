import { io } from 'socket.io-client';
import { resolveRealtimeNamespaceUrl } from '@/components/special-games/realtime-url';

export interface MapRevisionOptions {
  readonly onHealth?: (healthy: boolean) => void;
  readonly currentRevision?: () => string | undefined;
}
const ACK_TIMEOUT_MS = 5000;
const HEARTBEAT_TIMEOUT_MS = 20000;

/** Public invalidation only. Private state always comes from the authorized viewport API. */
export function watchMapRevisions(
  worldId: string,
  refresh: (revision?: number) => void,
  options: MapRevisionOptions = {},
): () => void {
  let closed = false;
  let generation = 0;
  let watchSequence = 0;
  let liveProof = false;
  let healthy: boolean | undefined;
  let revision = BigInt(-1);
  let failures = 0;
  let ackTimer: ReturnType<typeof setTimeout> | undefined;
  let heartbeatTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  const socket = io(
    resolveRealtimeNamespaceUrl(
      process.env.NEXT_PUBLIC_REALTIME_URL,
      window.location.origin,
      '/kingdoms',
    ),
    {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
    },
  );
  const setHealth = (value: boolean) => {
    if (healthy === value || closed) return;
    healthy = value;
    options.onHealth?.(value);
  };
  const clearTimers = () => {
    clearTimeout(ackTimer);
    clearTimeout(heartbeatTimer);
    clearTimeout(retryTimer);
    ackTimer = heartbeatTimer = retryTimer = undefined;
  };
  const retry = () => {
    clearTimeout(retryTimer);
    if (closed) return;
    // Namespace rejection disables Socket.IO's automatic reconnect; retry it explicitly.
    const reconnect = !socket.connected && socket.active === false;
    if (!socket.connected && !reconnect) return;
    const delay = Math.min(30000, 5000 * 2 ** Math.min(3, failures));
    failures += 1;
    retryTimer = setTimeout(() => {
      if (closed) return;
      if (reconnect) socket.connect();
      else watch();
    }, delay);
  };
  const heartbeat = () => {
    clearTimeout(heartbeatTimer);
    if (!liveProof || closed || !socket.connected) return;
    clearTimeout(retryTimer);
    retryTimer = undefined;
    if (ackTimer !== undefined) {
      clearTimeout(ackTimer);
      ackTimer = undefined;
      watchSequence += 1;
    }
    setHealth(true);
    heartbeatTimer = setTimeout(() => {
      setHealth(false);
      retry();
    }, HEARTBEAT_TIMEOUT_MS);
  };
  function watch() {
    if (closed || !socket.connected) return;
    const connection = generation;
    const sequence = ++watchSequence;
    clearTimeout(ackTimer);
    ackTimer = setTimeout(() => {
      if (closed || connection !== generation || sequence !== watchSequence) return;
      watchSequence += 1;
      setHealth(false);
      retry();
    }, ACK_TIMEOUT_MS);
    socket.emit('kingdoms:watch', { worldId }, (ack: unknown) => {
      if (closed || connection !== generation || sequence !== watchSequence) return;
      clearTimeout(ackTimer);
      ackTimer = undefined;
      const value =
        ack && typeof ack === 'object'
          ? (ack as {
              success?: unknown;
              worldId?: unknown;
              capability?: unknown;
              live?: unknown;
              heartbeatIntervalMs?: unknown;
              heartbeatTimeoutMs?: unknown;
            })
          : null;
      liveProof =
        value?.success === true &&
        value.worldId === worldId &&
        value.capability === 'revision-push-v1' &&
        value.live === true &&
        value.heartbeatIntervalMs === 5000 &&
        value.heartbeatTimeoutMs === HEARTBEAT_TIMEOUT_MS;
      if (!liveProof) {
        clearTimeout(heartbeatTimer);
        setHealth(false);
        retry();
        return;
      }
      failures = 0;
      heartbeat();
      // A reconnect/watch ACK is a resync boundary, never a gameplay snapshot.
      refresh();
    });
  }
  const connect = () => {
    if (closed) return;
    generation += 1;
    liveProof = false;
    clearTimers();
    setHealth(false);
    watch();
  };
  const disconnected = () => {
    if (closed) return;
    generation += 1;
    watchSequence += 1;
    liveProof = false;
    clearTimers();
    setHealth(false);
  };
  const failed = () => {
    disconnected();
    retry();
  };
  const receive = (event: unknown) => {
    if (closed || !socket.connected || !event || typeof event !== 'object') return;
    const value = event as { worldId?: unknown; revision?: unknown };
    if (
      value.worldId !== worldId ||
      typeof value.revision !== 'number' ||
      !Number.isSafeInteger(value.revision) ||
      value.revision < 0
    )
      return;
    // A duplicate is still proof of a working tick/publisher in an acknowledged live session.
    heartbeat();
    const current = options.currentRevision?.();
    const snapshotRevision =
      current && /^(0|[1-9]\d*)$/.test(current) ? BigInt(current) : BigInt(-1);
    const incoming = BigInt(value.revision);
    if (value.revision === 0 || incoming <= revision || incoming <= snapshotRevision) return;
    revision = incoming;
    refresh(value.revision);
  };
  setHealth(false);
  socket.on('connect', connect);
  socket.on('disconnect', disconnected);
  socket.on('connect_error', failed);
  socket.on('error', failed);
  socket.on('kingdoms:revision', receive);
  return () => {
    if (closed) return;
    closed = true;
    generation += 1;
    watchSequence += 1;
    clearTimers();
    socket.off('connect', connect);
    socket.off('disconnect', disconnected);
    socket.off('connect_error', failed);
    socket.off('error', failed);
    socket.off('kingdoms:revision', receive);
    socket.disconnect();
  };
}

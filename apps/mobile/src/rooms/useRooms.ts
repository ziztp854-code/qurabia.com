import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type {
  VoiceCreateInput, VoiceEvent, VoiceJoinInput, VoiceList, VoiceSnapshot, VoiceUpdateInput,
} from '../api/contracts';
import { createRoomsApi, type ApiRequest } from './api';
import { canEndRoom, endRoom } from './end';
import { isMembershipFailure, nextSnapshot, roomErrorMessage } from './state';

export type RoomConnection = 'idle' | 'connecting' | 'online' | 'offline';
const EMPTY_STATS: VoiceList['stats'] = { activeRooms: 0, listeners: 0, participants: 0 };

/**
 * One owner per signed-in app. Voice/chat consume its authoritative snapshot.
 * Polling uses the existing events GET heartbeat; it never auto-rejoins membership.
 * Android foreground/headless support is still required to execute JS while locked.
 */
export function useRooms(request: ApiRequest, { enabled }: { enabled: boolean }) {
  const api = useMemo(() => createRoomsApi(request), [request]);
  const [rooms, setRooms] = useState<VoiceList['rooms']>([]);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [snapshot, setSnapshot] = useState<VoiceSnapshot | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<RoomConnection>('idle');
  const snapshotRef = useRef<VoiceSnapshot | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const mounted = useRef(true);
  const generation = useRef(0);
  const membershipBusy = useRef(false);
  const ending = useRef<{ roomId: string; promise: Promise<void> } | null>(null);
  const listSequence = useRef(0);
  const listAbort = useRef<AbortController | null>(null);
  const readRef = useRef<{
    roomId: string; generation: number; controller: AbortController; promise: Promise<void>;
  } | null>(null);
  const failures = useRef(0);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const clearError = useCallback(() => setError(null), []);

  const clearMembership = useCallback(() => {
    generation.current += 1;
    readRef.current?.controller.abort();
    readRef.current = null;
    snapshotRef.current = null;
    if (mounted.current) setSnapshot(null);
  }, []);

  const apply = useCallback((incoming: VoiceSnapshot, capturedGeneration: number) => {
    const current = snapshotRef.current;
    if (!mounted.current || !enabledRef.current ||
        generation.current !== capturedGeneration || !current ||
        current.room.id !== incoming.room.id) return;
    if (nextSnapshot(current, incoming) !== incoming) return;
    if (!incoming.room.active || !incoming.me) {
      clearMembership();
      setError(incoming.room.active ? 'انتهت عضويتك في الغرفة. انضم مجددًا إن كان مسموحًا.' : 'انتهى البث في هذه الغرفة.');
      setConnection('idle');
      return;
    }
    snapshotRef.current = incoming;
    setSnapshot(incoming);
  }, [clearMembership]);

  const adoptSnapshot = useCallback((incoming: VoiceSnapshot) => {
    apply(incoming, generation.current);
  }, [apply]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!enabledRef.current) return;
    const sequence = ++listSequence.current;
    listAbort.current?.abort();
    const controller = new AbortController();
    listAbort.current = controller;
    setRefreshing(true);
    if (!snapshotRef.current) setConnection('connecting');
    try {
      const incoming = await api.list(controller.signal);
      if (!mounted.current || !enabledRef.current || sequence !== listSequence.current) return;
      setRooms(incoming.rooms);
      setStats(incoming.stats);
      if (!snapshotRef.current) setConnection('online');
      setError(null);
    } catch (cause) {
      if (!controller.signal.aborted && mounted.current && enabledRef.current &&
          sequence === listSequence.current) {
        setError(roomErrorMessage(cause));
        if (!snapshotRef.current) setConnection('offline');
      }
      if (!controller.signal.aborted) throw cause;
    } finally {
      if (mounted.current && sequence === listSequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [api]);

  const refreshSnapshot = useCallback((): Promise<void> => {
    const current = snapshotRef.current;
    if (!current || !enabledRef.current) return Promise.resolve();
    const roomId = current.room.id;
    const capturedGeneration = generation.current;
    const existing = readRef.current;
    if (existing?.roomId === roomId && existing.generation === capturedGeneration) return existing.promise;
    const controller = new AbortController();
    const promise = api.heartbeat(roomId, controller.signal).then((incoming) => {
      if (generation.current !== capturedGeneration || !enabledRef.current || !mounted.current) return;
      failures.current = 0;
      apply(incoming, capturedGeneration);
      if (snapshotRef.current) setConnection('online');
    }).catch((cause: unknown) => {
      if (controller.signal.aborted || generation.current !== capturedGeneration ||
          !enabledRef.current || !mounted.current) return;
      failures.current += 1;
      setError(roomErrorMessage(cause));
      setConnection('offline');
      // Rejoining after a kick/ban/expiry would undo an authoritative decision.
      if (isMembershipFailure(cause)) clearMembership();
      throw cause;
    }).finally(() => {
      if (readRef.current?.controller === controller) readRef.current = null;
    });
    readRef.current = { roomId, generation: capturedGeneration, controller, promise };
    return promise;
  }, [api, apply, clearMembership]);

  const startMembership = useCallback(async (
    operation: () => Promise<VoiceSnapshot>,
  ): Promise<VoiceSnapshot> => {
    if (!enabledRef.current) throw new Error('سجّل الدخول أولًا.');
    if (membershipBusy.current) throw new Error('انتظر اكتمال الطلب الحالي.');
    if (snapshotRef.current) throw new Error('غادر الغرفة الحالية قبل فتح غرفة أخرى.');
    membershipBusy.current = true;
    const capturedGeneration = ++generation.current;
    setBusy(true);
    setError(null);
    setConnection('connecting');
    try {
      const incoming = await operation();
      if (!mounted.current || !enabledRef.current || generation.current !== capturedGeneration) {
        // A join may commit after logout/unmount. Never clean it up with the next
        // account's credentials; the server expires the old membership after its TTL.
        throw new Error('أُلغيت عملية الانضمام.');
      }
      if (!incoming.me || !incoming.room.active) throw new Error('لم يؤكد الخادم عضويتك في غرفة نشطة.');
      failures.current = 0;
      snapshotRef.current = incoming;
      setSnapshot(incoming);
      setConnection('online');
      void refresh().catch(() => undefined);
      return incoming;
    } catch (cause) {
      if (mounted.current && enabledRef.current && generation.current === capturedGeneration) {
        setError(roomErrorMessage(cause));
        setConnection('offline');
      }
      throw cause;
    } finally {
      membershipBusy.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [api, refresh]);

  const create = useCallback((input: VoiceCreateInput) =>
    startMembership(() => api.create(input)), [api, startMembership]);

  const join = useCallback((roomId: string, input: VoiceJoinInput = {}) => {
    const current = snapshotRef.current;
    if (current?.room.id === roomId) return Promise.resolve(current);
    return startMembership(() => api.join(roomId, input));
  }, [api, startMembership]);

  const leave = useCallback(async (): Promise<void> => {
    if (membershipBusy.current) throw new Error('انتظر اكتمال الطلب الحالي.');
    const current = snapshotRef.current;
    if (!current) return;
    membershipBusy.current = true;
    setBusy(true);
    // Stop audio and reads immediately through the shared null snapshot.
    clearMembership();
    setConnection('idle');
    try {
      await api.leave(current.room.id);
      if (mounted.current && enabledRef.current) void refresh().catch(() => undefined);
    } catch (cause) {
      // Do not restore a possibly departed session or start its microphone again.
      if (mounted.current) setError(roomErrorMessage(cause));
      throw cause;
    } finally {
      membershipBusy.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [api, clearMembership, refresh]);

  const end = useCallback((): Promise<void> => {
    const pending = ending.current;
    if (pending) return pending.promise;
    const current = snapshotRef.current;
    if (!enabledRef.current || !current) return Promise.reject(new Error('انضم إلى الغرفة أولًا.'));
    if (!canEndRoom(current)) return Promise.reject(new Error('إنهاء البث متاح للمضيف فقط.'));
    if (membershipBusy.current) return Promise.reject(new Error('انتظر اكتمال الطلب الحالي.'));
    membershipBusy.current = true;
    setBusy(true);
    setError(null);
    const capturedGeneration = generation.current;
    const isCurrent = () => mounted.current && enabledRef.current &&
      generation.current === capturedGeneration && snapshotRef.current?.room.id === current.room.id;
    const promise = endRoom(api, current, isCurrent).then(() => {
      // A late ACK must never remove a replacement room or a replacement session.
      if (!isCurrent()) return;
      clearMembership();
      setConnection('idle');
      setRooms((previous) => previous.filter((room) => room.id !== current.room.id));
      void refresh().catch(() => undefined);
    }).catch((cause: unknown) => {
      // An unconfirmed close retains membership, its heartbeat, and the retry UI.
      if (isCurrent()) setError(roomErrorMessage(cause));
      throw cause;
    }).finally(() => {
      if (ending.current?.promise === promise) ending.current = null;
      membershipBusy.current = false;
      if (mounted.current) setBusy(false);
    });
    ending.current = { roomId: current.room.id, promise };
    return promise;
  }, [api, clearMembership, refresh]);

  const mutate = useCallback(async (
    operation: (roomId: string) => Promise<VoiceSnapshot>,
  ): Promise<VoiceSnapshot> => {
    const current = snapshotRef.current;
    if (!enabledRef.current || !current) throw new Error('انضم إلى الغرفة أولًا.');
    const capturedGeneration = generation.current;
    try {
      const incoming = await operation(current.room.id);
      apply(incoming, capturedGeneration);
      return incoming;
    } catch (cause) {
      if (mounted.current && enabledRef.current && generation.current === capturedGeneration) {
        setError(roomErrorMessage(cause));
        // A forbidden moderation action does not by itself revoke membership.
        const code = typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : '';
        if (['AUTH_REQUIRED', 'SESSION_REVOKED', 'NOT_JOINED', 'ROOM_CLOSED'].includes(String(code))) clearMembership();
      }
      throw cause;
    }
  }, [apply, clearMembership]);

  const send = useCallback((event: VoiceEvent) => mutate((roomId) => api.send(roomId, event)), [api, mutate]);
  const update = useCallback((input: VoiceUpdateInput) => mutate((roomId) => api.update(roomId, input)), [api, mutate]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      listAbort.current?.abort();
      readRef.current?.controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      listSequence.current += 1;
      listAbort.current?.abort();
      clearMembership();
      setRooms([]);
      setStats(EMPTY_STATS);
      setLoading(false);
      setRefreshing(false);
      setError(null);
      setConnection('idle');
      return;
    }
    setLoading(true);
    void refresh().catch(() => undefined);
    const timer = setInterval(() => {
      if (appState.current === 'active') void refresh().catch(() => undefined);
    }, 20_000);
    return () => {
      clearInterval(timer);
      listSequence.current += 1;
      listAbort.current?.abort();
    };
  }, [enabled, refresh, clearMembership]);

  const roomId = snapshot?.room.id;
  useEffect(() => {
    let stopped = false;
    let running = false;
    let wake = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (stopped || !enabled || !roomId || snapshotRef.current?.room.id !== roomId) return;
      if (running) { wake = true; return; }
      running = true;
      await refreshSnapshot().catch(() => undefined);
      running = false;
      if (stopped || snapshotRef.current?.room.id !== roomId) return;
      const delay = wake ? 0 : appState.current !== 'active' ? 20_000 :
        Math.min(20_000, 3_000 * (2 ** Math.min(failures.current, 3)));
      wake = false;
      timer = setTimeout(() => { void tick(); }, delay);
    };
    const listener = AppState.addEventListener('change', (state) => {
      appState.current = state;
      if (state === 'active') {
        clearTimeout(timer);
        if (roomId) void tick();
        else if (enabled) void refresh().catch(() => undefined);
      }
    });
    if (enabled && roomId) void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
      listener.remove();
      const activeRead = readRef.current;
      if (activeRead && activeRead.roomId === roomId) activeRead.controller.abort();
    };
  }, [enabled, roomId, refreshSnapshot, refresh]);

  return {
    rooms, stats, snapshot, loading, refreshing, busy, error, connection,
    refresh, refreshSnapshot, create, join, leave, end, send, update, adoptSnapshot, clearError,
  };
}

export type RoomsController = ReturnType<typeof useRooms>;

import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { VoiceEvent, VoiceSnapshot } from '../api/contracts';
import { ChatCommandIds, mergeChat, MESSAGE_TOPIC, readVoiceLivePacket, readVoiceRefresh, REFRESH_TOPIC, type VoiceLivePacket } from './model';
import { validateMessage, validReaction, VOICE_GIFTS, type VoiceGiftId } from './emojis';

export type ChatMediaEvents = {
  subscribeData(listener: (payload: Uint8Array, topic: string, senderIdentity?: string) => void): () => void;
  subscribeReconnected(listener: () => void): () => void;
};
export type VoiceChatOptions = {
  snapshot: VoiceSnapshot | null;
  send: (event: VoiceEvent) => Promise<VoiceSnapshot>;
  refreshSnapshot: () => Promise<void>;
  blockedUserIds?: readonly string[];
  media?: ChatMediaEvents;
};

/** Rooms owns heartbeat/polling and the cursor. Chat only overlays validated server deltas. */
export function useVoiceChat(options: VoiceChatOptions) {
  const latest = useRef(options);
  latest.current = options;
  const blockedKey = JSON.stringify(options.blockedUserIds ?? []);
  const [live, setLive] = useState<VoiceLivePacket[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const activeWrite = useRef<object | null>(null);
  const sessionKey = options.snapshot?.room.id + ':' + (options.snapshot?.me?.id ?? '');
  const commands = useRef({ key: sessionKey, ids: new ChatCommandIds(randomUUID) });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; activeWrite.current = null; };
  }, []);
  useEffect(() => {
    commands.current = { key: sessionKey, ids: new ChatCommandIds(randomUUID) };
    activeWrite.current = null;
    setBusy(false);
    setError('');
  }, [sessionKey]);
  useEffect(() => {
    setLive((previous) => mergeChat(options.snapshot, previous, options.blockedUserIds).pending);
  }, [options.snapshot, blockedKey]);

  const clearError = useCallback(() => setError(''), []);
  const refresh = useCallback(async () => {
    try { await latest.current.refreshSnapshot(); }
    catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : 'تعذر مزامنة الدردشة.');
    }
  }, []);
  const acceptData = useCallback((payload: Uint8Array, topic: string, senderIdentity?: string) => {
    // LiveKit server packets have no participant sender. Ignore all peer-originated data.
    if (senderIdentity !== undefined) return;
    const current = latest.current;
    const snapshot = current.snapshot;
    if (!snapshot?.me || !snapshot.room.active) return;
    if (topic === MESSAGE_TOPIC) {
      const packet = readVoiceLivePacket(payload, snapshot.room.id);
      if (packet) setLive((previous) =>
        mergeChat(snapshot, [...previous, packet], current.blockedUserIds).pending);
    } else if (topic === REFRESH_TOPIC && readVoiceRefresh(payload, snapshot.room.id)) {
      // The shared rooms controller coalesces invalidations and owns the fallback poll.
      void refresh();
    }
  }, [refresh]);
  useEffect(() => {
    if (!options.media) return;
    const stopData = options.media.subscribeData(acceptData);
    const stopReconnect = options.media.subscribeReconnected(() => { void refresh(); });
    return () => { stopData(); stopReconnect(); };
  }, [options.media, acceptData, refresh]);

  const write = useCallback(async (event: VoiceEvent, fingerprint?: string) => {
    const current = latest.current;
    const snapshot = current.snapshot;
    if (!snapshot?.me || !snapshot.room.active) throw new Error('انضم إلى الغرفة أولًا.');
    if (!snapshot.room.chatEnabled) throw new Error('الدردشة معطّلة من المضيف.');
    if (activeWrite.current) throw new Error('انتظر تأكيد الإرسال السابق.');
    const key = snapshot.room.id + ':' + snapshot.me.id;
    if (commands.current.key !== key)
      commands.current = { key, ids: new ChatCommandIds(randomUUID) };
    const ids = commands.current.ids;
    const requestId = fingerprint ? ids.for(fingerprint) : undefined;
    const command = requestId && (event.type === 'message' || event.type === 'reaction')
      ? { ...event, requestId } : event;
    const operation = {};
    activeWrite.current = operation;
    setBusy(true);
    setError('');
    try {
      await current.send(command);
      if (fingerprint && requestId) ids.acknowledge(fingerprint, requestId);
    } catch (cause) {
      // Keep the exact requestId after ambiguous timeout/offline failure. No blind auto retry,
      // and gifts are never retried automatically because the server has no gift receipt ID.
      if (mounted.current && activeWrite.current === operation)
        setError(cause instanceof Error ? cause.message : 'تعذر الإرسال. أعد المحاولة.');
      throw cause;
    } finally {
      if (activeWrite.current === operation) {
        activeWrite.current = null;
        if (mounted.current) setBusy(false);
      }
    }
  }, []);
  const sendMessage = useCallback(async (text: string, replyTo?: string) => {
    const value = validateMessage(text);
    await write({ type: 'message', text: value, ...(replyTo ? { replyTo } : {}) },
      JSON.stringify(['message', value, replyTo ?? null]));
  }, [write]);
  const react = useCallback(async (messageId: string, emoji: string) => {
    if (!validReaction(emoji)) throw new Error('هذا التفاعل غير متاح.');
    await write({ type: 'reaction', messageId, emoji }, JSON.stringify(['reaction', messageId, emoji]));
  }, [write]);
  const sendGift = useCallback(async (giftId: VoiceGiftId, recipientId: string) => {
    if (!VOICE_GIFTS.some((gift) => gift.id === giftId)) throw new Error('الهدية غير متاحة.');
    await write({ type: 'gift', giftId, recipientId });
  }, [write]);
  const messages = useMemo(() => mergeChat(options.snapshot, live, options.blockedUserIds).messages,
    [options.snapshot, blockedKey, live]);
  return { messages, busy, error, sendMessage, react, sendGift, acceptData, refresh, clearError };
}

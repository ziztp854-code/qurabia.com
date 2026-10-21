import { useCallback, useEffect, useState } from 'react';
import type { ApiRequest } from '../rooms/api';
import type { VoiceEmojiPack } from './emojis';

const idPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function readEmojiPacks(value: unknown): VoiceEmojiPack[] {
  if (!Array.isArray(value)) throw new Error('استجابة حزم الفيسات غير صالحة.');
  return value.slice(0, 30).flatMap((pack): VoiceEmojiPack[] => {
    if (!pack || typeof pack !== 'object' || typeof pack.id !== 'string' ||
        typeof pack.name !== 'string' || pack.enabled !== true || !Array.isArray(pack.emojis)) return [];
    return [{
      id: pack.id, name: pack.name, enabled: true,
      emojis: pack.emojis.filter((emoji: unknown): emoji is VoiceEmojiPack['emojis'][number] => {
        if (!emoji || typeof emoji !== 'object') return false;
        const item = emoji as Record<string, unknown>;
        return typeof item.id === 'string' && idPattern.test(item.id) &&
          typeof item.label === 'string' && item.label.length <= 120 && typeof item.animated === 'boolean';
      }),
    }];
  });
}

/** Fetch on opening the picker, never per keystroke. No cross-account catalog cache. */
export function useEmojiCatalog(request: ApiRequest, enabled: boolean) {
  const [packs, setPacks] = useState<VoiceEmojiPack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => {
    if (!enabled) {
      setPacks([]);
      setLoading(false);
      setError('');
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void request<unknown>('/api/voice/emojis', { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setPacks(readEmojiPacks(value));
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'تعذر تحميل الحزم. التعبيرات الأساسية متاحة.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [request, enabled, attempt]);
  return { packs, loading, error, reload };
}

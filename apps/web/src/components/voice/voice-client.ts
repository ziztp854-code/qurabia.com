import type { VoicePreferences } from '@/lib/voice/types';

export class VoiceRequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = 'VoiceRequestError';
  }
}

export async function voiceRequest<T>(
  path: string,
  body?: unknown,
  method = 'POST',
  options: { signal?: AbortSignal } = {},
): Promise<T> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout>;
  let cancel: () => void;
  const deadline = new Promise<never>((_, reject) => {
    cancel = () => {
      controller.abort(options.signal?.reason);
      reject(controller.signal.reason);
    };
    timeout = setTimeout(() => {
      const error = new VoiceRequestError('انتهت مهلة الطلب. حاول مرة أخرى.', 408, 'REQUEST_TIMEOUT');
      controller.abort(error);
      reject(error);
    }, 10_000);
  });
  options.signal?.addEventListener('abort', cancel!, { once: true });
  try {
    if (options.signal?.aborted) cancel!();
    return await Promise.race([
      (async () => {
        controller.signal.throwIfAborted();
        const response = await fetch(`/api/voice/${path}`, {
          method: body === undefined ? 'GET' : method,
          headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
          cache: 'no-store',
          signal: controller.signal,
        });
        const value = await response.json().catch(() => ({}));
        if (!response.ok)
          throw new VoiceRequestError(
            value.error || 'تعذر تنفيذ الطلب. حاول مرة أخرى.',
            response.status,
            value.code,
          );
        return value as T;
      })(),
      deadline,
    ]);
  } finally {
    clearTimeout(timeout!);
    options.signal?.removeEventListener('abort', cancel!);
  }
}

export const emptyPreferences: VoicePreferences = {
  favorites: [],
  following: [],
  history: [],
  blockedUsers: [],
  mutedUsers: [],
  privateProfile: false,
  notifyFavorites: true,
};
export const coverPresets = [
  { id: 'friends', label: 'مجلس الأصدقاء' },
  { id: 'coffee', label: 'قهوة وسوالف' },
  { id: 'gaming', label: 'مساحة التحدي' },
  { id: 'oud', label: 'جلسة طرب' },
  { id: 'discussion', label: 'نقاشات حرة' },
  { id: 'quiz', label: 'مسابقات مباشرة' },
];
export function coverPath(id: string) {
  return `/voice/covers/${id}.webp`;
}
export const roleLabels = {
  host: 'المضيف',
  moderator: 'مشرف',
  speaker: 'متحدث',
  listener: 'مستمع',
};
export function number(value: number) {
  return new Intl.NumberFormat('ar-SA').format(value);
}

// Requests can complete out of order; never restore an older seat or moderation state.
export function nextSnapshot(
  current: import('@/lib/voice/types').VoiceSnapshot | null,
  incoming: import('@/lib/voice/types').VoiceSnapshot,
) {
  return current && current.cursor > incoming.cursor ? current : incoming;
}
export function requestedSeat(
  participant: import('@/lib/voice/types').VoiceParticipant,
  room: Pick<import('@/lib/voice/types').VoiceRoom, 'seatCount' | 'lockedSeats'>,
  participants: import('@/lib/voice/types').VoiceParticipant[],
) {
  const available = (index: number) =>
    index >= 0 &&
    index < room.seatCount &&
    !room.lockedSeats.includes(index) &&
    !participants.some((p) => p.seatIndex === index);
  if (participant.requestedSeat !== null && available(participant.requestedSeat))
    return participant.requestedSeat;
  return Array.from({ length: room.seatCount }, (_, index) => index).find(available);
}
export function captureInvite(roomId: string): string | null {
  const key = `tahaddi:voice-invite:${roomId}`;
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const invite = fragment.get('invite');
  if (invite) {
    fragment.delete('invite');
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${window.location.search}${fragment.size ? `#${fragment}` : ''}`,
    );
    if (invite.length >= 24 && invite.length <= 100) {
      try {
        sessionStorage.setItem(key, invite);
      } catch {
        /* A live tab can retain its token in memory. */
      }
      return invite;
    }
  }
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
export function clearSavedInvite(roomId: string) {
  try {
    sessionStorage.removeItem(`tahaddi:voice-invite:${roomId}`);
  } catch {
    /* Optional transient state. */
  }
}

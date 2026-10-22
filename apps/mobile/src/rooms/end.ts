import type { VoiceSnapshot } from '../api/contracts';
import type { createRoomsApi } from './api';

type EndRoomApi = Pick<ReturnType<typeof createRoomsApi>, 'end' | 'snapshot'>;

/** Mirror the existing server close permission: only the current room host. */
export function canEndRoom(snapshot: VoiceSnapshot | null): boolean {
  return Boolean(snapshot?.room.active && snapshot.me?.role === 'host');
}

function confirmsClosed(current: VoiceSnapshot, incoming: VoiceSnapshot): boolean {
  return incoming?.room?.id === current.room.id && incoming.room.active === false &&
    incoming.me === null && Array.isArray(incoming.participants) &&
    incoming.participants.length === 0 && Number.isSafeInteger(incoming.cursor) &&
    incoming.cursor >= current.cursor;
}

/**
 * Close once while membership still exists. A lost response may follow a committed
 * close, so confirm with a read; never retry the write or manufacture closed state.
 */
export async function endRoom(
  api: EndRoomApi,
  current: VoiceSnapshot,
  isCurrent: () => boolean = () => true,
): Promise<VoiceSnapshot> {
  if (!canEndRoom(current)) throw new Error('إنهاء البث متاح للمضيف الموجود في الغرفة فقط.');
  if (!isCurrent()) throw new Error('تغيّرت الجلسة قبل إنهاء البث.');
  try {
    const incoming = await api.end(current.room.id);
    if (!confirmsClosed(current, incoming))
      throw new Error('لم يؤكد الخادم إنهاء البث. أبقِ الغرفة مفتوحة وأعد المحاولة.');
    return incoming;
  } catch (failure) {
    // Do not issue a follow-up read through a replacement account or membership.
    if (!isCurrent()) throw failure;
    let incoming: VoiceSnapshot;
    try { incoming = await api.snapshot(current.room.id); }
    catch { throw failure; }
    if (confirmsClosed(current, incoming)) return incoming;
    throw failure;
  }
}

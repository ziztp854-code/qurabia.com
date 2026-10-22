import type { VoiceSnapshot } from '../api/contracts';
import { canEndRoom } from '../rooms/end';

export type RoomExitMode = 'leave' | 'end' | 'logout' | 'local-logout';
export type RoomExitTarget = Readonly<{ generation: number; roomId: string | null; host: boolean }>;
export type RoomExitResult = {
  status: 'complete' | 'close-failed' | 'stale' | 'not-host';
  warnings: string[];
};
export type RoomExitPorts = {
  sessionGeneration(): number;
  currentRoomId(): string | null;
  stopAudio(): Promise<void>;
  end(): Promise<void>;
  leave(): Promise<void>;
  signOut(): Promise<void>;
};

export function captureRoomExitTarget(snapshot: VoiceSnapshot | null, generation: number): RoomExitTarget {
  return { generation, roomId: snapshot?.room.id ?? null, host: canEndRoom(snapshot) };
}

/** Local audio is stopped first; closing a host room requires its live membership. */
export async function executeRoomExit(
  target: RoomExitTarget, mode: RoomExitMode, ports: RoomExitPorts,
): Promise<RoomExitResult> {
  const warnings: string[] = [];
  const result = (status: RoomExitResult['status']): RoomExitResult => ({ status, warnings });
  const sessionCurrent = () => ports.sessionGeneration() === target.generation;
  const roomCurrent = (allowCleared = false) => ports.currentRoomId() === target.roomId ||
    (allowCleared && ports.currentRoomId() === null);
  if (!sessionCurrent() || !roomCurrent(true)) return result('stale');
  if (mode === 'end' && !target.host) return result('not-host');
  try { await ports.stopAudio(); }
  catch { warnings.push('تعذر تأكيد اكتمال إيقاف الصوت على هذا الجهاز.'); }
  if (!sessionCurrent() || !roomCurrent(true)) return result('stale');

  const mustEnd = target.host && mode !== 'local-logout' && mode !== 'leave';
  if (mustEnd) {
    // A membership already lost cannot authorize a close. Do not silently log out.
    if (!roomCurrent()) return result('close-failed');
    try { await ports.end(); }
    catch {
      if (!sessionCurrent() || !roomCurrent(true)) return result('stale');
      return result('close-failed');
    }
    if (!sessionCurrent() || !roomCurrent(true)) return result('stale');
    // end() clears membership only after an authoritative closed-room response.
  } else if (target.roomId && roomCurrent()) {
    try { await ports.leave(); }
    catch { warnings.push('تعذر تأكيد مغادرة الغرفة لدى الخادم.'); }
    if (!sessionCurrent() || !roomCurrent(true)) return result('stale');
  }

  if (mode === 'logout' || mode === 'local-logout') {
    if (!sessionCurrent() || !roomCurrent(true)) return result('stale');
    await ports.signOut();
    if (mode === 'local-logout' && target.host)
      warnings.push('خرجت من هذا الجهاز دون تأكيد إنهاء البث؛ قد يبقى مفتوحًا.');
  }
  return result('complete');
}

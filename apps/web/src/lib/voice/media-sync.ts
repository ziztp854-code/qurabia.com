import 'server-only';
import { reconcileVoiceMedia } from './livekit';
import { processVoiceMediaJob } from './media-sync-queue';
import type { VoiceSnapshot } from './types';
// Database commands already succeeded when this runs. A failed SFU refresh is
// represented explicitly, so clients never retry a successfully posted message.
export async function synchronizeVoiceMedia(
  roomId: string,
  snapshot: VoiceSnapshot,
  periodic = false,
): Promise<VoiceSnapshot> {
  try {
    const result = await processVoiceMediaJob(roomId);
    if (result === 'empty') {
      await reconcileVoiceMedia(roomId, snapshot, periodic);
      return { ...snapshot, mediaSyncPending: snapshot.mediaSyncPending ?? false };
    }
    // The returned snapshot predates reconciliation. A concurrent mutation can
    // enqueue a newer generation, so only a later fresh snapshot can confirm it.
    return { ...snapshot, mediaSyncPending: true };
  } catch {
    console.error('[voice] media synchronization pending');
    return { ...snapshot, mediaSyncPending: true };
  }
}

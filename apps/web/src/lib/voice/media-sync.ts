import 'server-only';
import { reconcileVoiceMedia } from './livekit';
import type { VoiceSnapshot } from './types';
// Database commands already succeeded when this runs. A failed SFU refresh is
// represented explicitly, so clients never retry a successfully posted message.
export async function synchronizeVoiceMedia(
  roomId: string,
  snapshot: VoiceSnapshot,
  periodic = false,
): Promise<VoiceSnapshot> {
  try {
    await reconcileVoiceMedia(roomId, snapshot, periodic);
    return { ...snapshot, mediaSyncPending: false };
  } catch {
    console.error('[voice] media synchronization pending');
    return { ...snapshot, mediaSyncPending: true };
  }
}

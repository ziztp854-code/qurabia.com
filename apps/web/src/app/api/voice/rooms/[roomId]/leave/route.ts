import { voiceIdentity, voiceRateLimit } from '@/lib/voice/identity';
import { jsonSuccess, jsonFailure, voiceOrigin } from '@/lib/voice/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ roomId: string }> };
import { leaveVoiceRoom } from '@/lib/voice/repository';
import { synchronizeVoiceMedia } from '@/lib/voice/media-sync';
export async function POST(request: Request, context: Context) {
  try {
    voiceOrigin(request);
    const user = await voiceIdentity();
    await voiceRateLimit(user.id, true);
    const { roomId } = await context.params;
    const snapshot = await synchronizeVoiceMedia(roomId, await leaveVoiceRoom(roomId, user.id));
    return jsonSuccess({ ok: true, mediaSyncPending: snapshot.mediaSyncPending ?? false });
  } catch (error) {
    return jsonFailure(error);
  }
}

import { voiceIdentity, voiceRateLimit } from '@/lib/voice/identity';
import { jsonSuccess, jsonFailure, voiceOrigin, readVoiceBody } from '@/lib/voice/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ roomId: string }> };
import { updateRoomSchema } from '@/lib/voice/schemas';
import { getVoiceSnapshot, updateVoiceRoom } from '@/lib/voice/repository';
import { synchronizeVoiceMedia } from '@/lib/voice/media-sync';
export async function GET(_request: Request, context: Context) {
  try {
    const user = await voiceIdentity();
    await voiceRateLimit(user.id, false);
    const { roomId } = await context.params;
    return jsonSuccess(await getVoiceSnapshot(roomId, user.id));
  } catch (error) {
    return jsonFailure(error);
  }
}
export async function PATCH(request: Request, context: Context) {
  try {
    voiceOrigin(request);
    const user = await voiceIdentity();
    await voiceRateLimit(user.id, true);
    const { roomId } = await context.params;
    const input = await readVoiceBody(request, updateRoomSchema);
    return jsonSuccess(
      await synchronizeVoiceMedia(roomId, await updateVoiceRoom(roomId, user.id, input)),
    );
  } catch (error) {
    return jsonFailure(error);
  }
}

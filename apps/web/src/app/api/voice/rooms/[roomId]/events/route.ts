import { voiceIdentity, voiceRateLimit } from '@/lib/voice/identity';
import { jsonSuccess, jsonFailure, voiceOrigin, readVoiceBody } from '@/lib/voice/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ roomId: string }> };
import { voiceEventSchema } from '@/lib/voice/schemas';
import { getVoiceSnapshot, sendVoiceEvent } from '@/lib/voice/repository';
import { synchronizeVoiceMedia } from '@/lib/voice/media-sync';
export async function GET(_request: Request, context: Context) {
  try {
    const user = await voiceIdentity();
    await voiceRateLimit(user.id, false);
    const { roomId } = await context.params;
    return jsonSuccess(
      await synchronizeVoiceMedia(roomId, await getVoiceSnapshot(roomId, user.id, true)),
    );
  } catch (error) {
    return jsonFailure(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    voiceOrigin(request);
    const user = await voiceIdentity();
    await voiceRateLimit(user.id, true);
    const { roomId } = await context.params;
    const event = await readVoiceBody(request, voiceEventSchema);
    return jsonSuccess(
      await synchronizeVoiceMedia(roomId, await sendVoiceEvent(roomId, user.id, event)),
    );
  } catch (error) {
    return jsonFailure(error);
  }
}

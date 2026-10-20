import { voiceIdentity, voiceRateLimit } from '@/lib/voice/identity';
import { jsonSuccess, jsonFailure, voiceOrigin, readVoiceBody } from '@/lib/voice/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ roomId: string }> };
import { joinRoomSchema } from '@/lib/voice/schemas';
import { joinVoiceRoom } from '@/lib/voice/repository';
import { synchronizeVoiceMedia } from '@/lib/voice/media-sync';
import { announceVoiceChange } from '@/lib/voice/notifications';
export async function POST(request: Request, context: Context) {
  try {
    voiceOrigin(request);
    const user = await voiceIdentity();
    await voiceRateLimit(user.id, true, 'join');
    const { roomId } = await context.params;
    const input = await readVoiceBody(request, joinRoomSchema);
    return jsonSuccess(
      announceVoiceChange(
        await synchronizeVoiceMedia(roomId, await joinVoiceRoom(roomId, user, input)),
      ),
    );
  } catch (error) {
    return jsonFailure(error);
  }
}

import { voiceIdentity, voiceRateLimit } from '@/lib/voice/identity';
import { jsonSuccess, jsonFailure, voiceOrigin, readVoiceBody } from '@/lib/voice/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ roomId: string }> };
import { voiceEventSchema } from '@/lib/voice/schemas';
import { getVoiceSnapshot, sendVoiceEvent } from '@/lib/voice/repository';
import { synchronizeVoiceMedia } from '@/lib/voice/media-sync';
import { announceVoiceChange } from '@/lib/voice/notifications';
export async function GET(_request: Request, context: Context) {
  try {
    const user = await voiceIdentity();
    await voiceRateLimit(user.id, false);
    const { roomId } = await context.params;
    return jsonSuccess(
      await synchronizeVoiceMedia(roomId, await getVoiceSnapshot(roomId, user.id, true), true),
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
    const snapshot = await sendVoiceEvent(roomId, user.id, event);
    // These commands never change an SFU publication grant. Persist and respond immediately.
    const local = [
      'mute',
      'gift',
      'message',
      'reaction',
      'room-reaction',
      'hand',
      'pin-message',
      'delete-message',
      'report',
      'deny-seat',
      'lock-seat',
    ].includes(event.type);
    return jsonSuccess(
      announceVoiceChange(
        local ? snapshot : await synchronizeVoiceMedia(roomId, snapshot),
        event.type === 'message' || event.type === 'gift'
          ? event.requestId
            ? snapshot.messages.find(
                (message) => message.userId === user.id && message.clientId === event.requestId,
              )?.id
            : snapshot.messages.at(-1)?.id
          : undefined,
      ),
    );
  } catch (error) {
    return jsonFailure(error);
  }
}

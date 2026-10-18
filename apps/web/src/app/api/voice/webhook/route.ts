import { WebhookReceiver } from 'livekit-server-sdk';
import { jsonFailure, jsonSuccess, VoiceHttpError } from '@/lib/voice/http';
import {
  voiceMediaConfig,
  VOICE_MEDIA_ROOM_PREFIX,
  reconcileVoiceMedia,
} from '@/lib/voice/livekit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    const config = voiceMediaConfig();
    if (!config) throw new VoiceHttpError(503, 'خدمة الصوت غير مهيأة.', 'MEDIA_SETUP_REQUIRED');
    const authorization = request.headers.get('authorization');
    if (!authorization) throw new VoiceHttpError(401, 'توقيع مفقود.');
    const reader = request.body?.getReader();
    if (!reader) throw new VoiceHttpError(400, 'الطلب فارغ.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 65_536) {
          await reader.cancel();
          throw new VoiceHttpError(413, 'حجم الطلب أكبر من المسموح.');
        }
        chunks.push(chunk.value);
      }
    } finally {
      reader.releaseLock();
    }
    let event;
    try {
      event = await new WebhookReceiver(config.apiKey, config.apiSecret).receive(
        Buffer.concat(chunks).toString('utf8'),
        authorization,
      );
    } catch {
      throw new VoiceHttpError(401, 'توقيع غير صالح.');
    }
    if (
      event.event === 'participant_joined' &&
      event.room?.name.startsWith(VOICE_MEDIA_ROOM_PREFIX) &&
      event.participant?.identity
    ) {
      const roomId = event.room.name.slice(VOICE_MEDIA_ROOM_PREFIX.length);
      await reconcileVoiceMedia(roomId);
    }
    return jsonSuccess({ ok: true });
  } catch (error) {
    return jsonFailure(error);
  }
}

import { z } from 'zod';
import { voiceIdentity, voiceRateLimit } from '@/lib/voice/identity';
import {
  jsonSuccess,
  jsonFailure,
  voiceOrigin,
  readVoiceBody,
  VoiceHttpError,
} from '@/lib/voice/http';
import { voiceConversation, sendVoiceDirectMessage, voiceContact } from '@/lib/voice/social';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ peerId: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const user = await voiceIdentity();
    await voiceRateLimit(user.id, false, 'social');
    const { peerId } = await context.params;
    if (new URL(request.url).searchParams.get('profile') === '1') {
      const { peer, relationship, blocked } = await voiceContact(user.id, peerId);
      if (blocked) throw new VoiceHttpError(403, 'التواصل غير متاح.');
      return jsonSuccess({ peer, relationship });
    }
    return jsonSuccess(await voiceConversation(user.id, peerId));
  } catch (error) {
    return jsonFailure(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    voiceOrigin(request);
    const user = await voiceIdentity();
    await voiceRateLimit(user.id, true, 'social');
    const { text } = await readVoiceBody(
      request,
      z.object({ text: z.string().trim().min(1).max(1000) }).strict(),
    );
    return jsonSuccess(await sendVoiceDirectMessage(user.id, (await context.params).peerId, text));
  } catch (error) {
    return jsonFailure(error);
  }
}

import { voiceIdentity, voiceRateLimit } from '@/lib/voice/identity';
import { jsonSuccess, jsonFailure, voiceOrigin } from '@/lib/voice/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ roomId: string }> };
import { createVoiceInvite } from '@/lib/voice/repository';
export async function POST(request: Request, context: Context) {
  try {
    voiceOrigin(request);
    const user = await voiceIdentity();
    await voiceRateLimit(user.id, true, 'invite');
    const { roomId } = await context.params;
    const origin = new URL(process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? request.url).origin;
    return jsonSuccess(await createVoiceInvite(roomId, user.id, origin));
  } catch (error) {
    return jsonFailure(error);
  }
}

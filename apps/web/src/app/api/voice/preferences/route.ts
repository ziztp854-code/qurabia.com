import { voiceIdentity, voiceRateLimit } from '@/lib/voice/identity';
import { jsonSuccess, jsonFailure, voiceOrigin, readVoiceBody } from '@/lib/voice/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { preferencesActionSchema } from '@/lib/voice/schemas';
import { getVoicePreferences, updateVoicePreferences } from '@/lib/voice/repository';
export async function GET() {
  try {
    const user = await voiceIdentity();
    await voiceRateLimit(user.id, false, 'preferences');
    return jsonSuccess(await getVoicePreferences(user.id));
  } catch (error) {
    return jsonFailure(error);
  }
}
export async function PATCH(request: Request) {
  try {
    voiceOrigin(request);
    const user = await voiceIdentity();
    await voiceRateLimit(user.id, true, 'preferences');
    const action = await readVoiceBody(request, preferencesActionSchema);
    return jsonSuccess(await updateVoicePreferences(user.id, action));
  } catch (error) {
    return jsonFailure(error);
  }
}

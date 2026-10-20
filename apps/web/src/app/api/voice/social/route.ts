import { voiceIdentity, voiceRateLimit } from '@/lib/voice/identity';
import { jsonSuccess, jsonFailure } from '@/lib/voice/http';
import { voiceContacts } from '@/lib/voice/social';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const user = await voiceIdentity();
    await voiceRateLimit(user.id, false, 'contacts');
    return jsonSuccess(await voiceContacts(user.id));
  } catch (error) {
    return jsonFailure(error);
  }
}

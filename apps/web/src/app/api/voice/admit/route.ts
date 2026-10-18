import { admitVoiceSignal } from '@/lib/voice/admission';
import { VoiceMediaUnavailable } from '@/lib/voice/livekit';
import { jsonFailure, jsonSuccess, readVoiceBody, VoiceHttpError } from '@/lib/voice/http';
import { z } from 'zod';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    // Explicit bearer authentication, never ambient cookies. This is a server-to-server exchange.
    const authorization = request.headers.get('authorization') ?? '';
    if (authorization.length > 16_400 || !authorization.startsWith('Bearer '))
      throw new VoiceHttpError(401, 'الاتصال غير مصرح به.');
    await readVoiceBody(request, z.object({}).strict());
    const grant = await admitVoiceSignal(authorization.slice(7));
    return jsonSuccess({ token: grant.token });
  } catch (error) {
    if (error instanceof VoiceMediaUnavailable)
      return jsonFailure(new VoiceHttpError(503, error.message, 'MEDIA_SETUP_REQUIRED'));
    return jsonFailure(error);
  }
}

import { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import { jsonFailure, jsonSuccess, KingdomsHttpError } from '@/lib/kingdoms/http';
import { tickKingdomWorlds } from '@/lib/kingdoms/repository';
import { kingdomsRealtimeCapability } from '@/lib/kingdoms/realtime-notifications';
const tickInput = z.object({
  limit: z.number().int().min(1).max(10).optional(),
  watchedWorldIds: z.array(z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/)).max(512).optional(),
}).strict();
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const secret = process.env.KINGDOMS_WORKER_SECRET;
    const supplied = request.headers.get('authorization') ?? '';
    if (!secret || secret.length < 32) throw new KingdomsHttpError(503, 'عامل الممالك غير مهيأ.');
    const expected = `Bearer ${secret}`;
    if (
      Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    )
      throw new KingdomsHttpError(401, 'غير مصرح.');
    const body = await request.text();
    let decoded: unknown;
    try { decoded = body ? JSON.parse(body) : {}; }
    catch { throw new KingdomsHttpError(400, 'Invalid tick body.'); }
    const input = tickInput.parse(decoded);
    const result = await tickKingdomWorlds(undefined, input.watchedWorldIds);
    return jsonSuccess({ ...result, realtime: await kingdomsRealtimeCapability() });
  } catch (error) {
    return jsonFailure(error);
  }
}

import { timingSafeEqual } from 'node:crypto';
import { jsonFailure, jsonSuccess, KingdomsHttpError } from '@/lib/kingdoms/http';
import { tickKingdomWorlds } from '@/lib/kingdoms/repository';
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
    return jsonSuccess(await tickKingdomWorlds());
  } catch (error) {
    return jsonFailure(error);
  }
}

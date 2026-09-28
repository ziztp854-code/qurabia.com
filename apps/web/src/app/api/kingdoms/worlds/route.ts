import { kingdomIdentity, kingdomRateLimit } from '@/lib/kingdoms/identity';
import { jsonFailure, jsonSuccess } from '@/lib/kingdoms/http';
import { listKingdomWorlds } from '@/lib/kingdoms/repository';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const user = await kingdomIdentity();
    await kingdomRateLimit(user.id, false);
    return jsonSuccess(await listKingdomWorlds());
  } catch (error) {
    return jsonFailure(error);
  }
}

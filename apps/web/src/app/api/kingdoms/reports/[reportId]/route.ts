import { kingdomIdentity, kingdomRateLimit } from '@/lib/kingdoms/identity';
import { jsonFailure, jsonSuccess } from '@/lib/kingdoms/http';
import { readRoyalReport } from '@/lib/kingdoms/reports-repository';
import { worldIdSchema } from '@/lib/kingdoms/api-schema';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ reportId: string }> }) {
  try {
    const identity = await kingdomIdentity();
    await kingdomRateLimit(identity.id, false);
    const worldId = worldIdSchema.parse(new URL(request.url).searchParams.get('worldId'));
    return jsonSuccess(await readRoyalReport(worldId, (await context.params).reportId, identity));
  } catch (error) {
    return jsonFailure(error);
  }
}

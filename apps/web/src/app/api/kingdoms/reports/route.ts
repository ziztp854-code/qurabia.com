import { kingdomIdentity, kingdomRateLimit } from '@/lib/kingdoms/identity';
import { assertSameOrigin, jsonFailure, jsonSuccess, readCommandBody } from '@/lib/kingdoms/http';
import { listRoyalReports, markRoyalReportRead } from '@/lib/kingdoms/reports-repository';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const identity = await kingdomIdentity();
    await kingdomRateLimit(identity.id, false);
    return jsonSuccess(
      await listRoyalReports(Object.fromEntries(new URL(request.url).searchParams), identity),
    );
  } catch (error) {
    return jsonFailure(error);
  }
}
export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const identity = await kingdomIdentity();
    await kingdomRateLimit(identity.id, true);
    return jsonSuccess(await markRoyalReportRead(await readCommandBody(request), identity));
  } catch (error) {
    return jsonFailure(error);
  }
}

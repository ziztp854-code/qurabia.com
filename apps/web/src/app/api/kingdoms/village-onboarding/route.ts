import { z } from 'zod';
import { kingdomIdentity, kingdomRateLimit } from '@/lib/kingdoms/identity';
import { assertSameOrigin, jsonFailure, jsonSuccess, readCommandBody } from '@/lib/kingdoms/http';
import {
  completeVillageOnboarding,
  readVillageOnboarding,
} from '@/lib/kingdoms/village-onboarding';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const completionRequest = z.object({ completed: z.literal(true) }).strict();

export async function GET() {
  try {
    const user = await kingdomIdentity();
    await kingdomRateLimit(user.id, false);
    return jsonSuccess(await readVillageOnboarding(user));
  } catch (error) {
    return jsonFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await kingdomIdentity();
    await kingdomRateLimit(user.id, true);
    completionRequest.parse(await readCommandBody(request));
    return jsonSuccess(await completeVillageOnboarding(user));
  } catch (error) {
    return jsonFailure(error);
  }
}

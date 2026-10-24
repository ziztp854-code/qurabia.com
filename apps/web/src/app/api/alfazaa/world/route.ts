import { alfazaaIdentity, alfazaaRateLimit } from '@/lib/alfazaa/server/identity';
import {
  assertSameOrigin,
  readCommandBody,
  jsonSuccess,
  jsonFailure,
} from '@/lib/alfazaa/server/http';
import { readAlfazaaWorld, commandAlfazaaWorld } from '@/lib/alfazaa/server/world-repository';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const user = await alfazaaIdentity();
    await alfazaaRateLimit(user.id, false);
    return jsonSuccess(await readAlfazaaWorld(user));
  } catch (error) {
    return jsonFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await alfazaaIdentity();
    await alfazaaRateLimit(user.id, true);
    return jsonSuccess(await commandAlfazaaWorld(user, await readCommandBody(request)));
  } catch (error) {
    return jsonFailure(error);
  }
}

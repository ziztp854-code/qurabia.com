import { alfazaaIdentity, alfazaaRateLimit } from '@/lib/alfazaa/server/identity';
import {
  assertSameOrigin,
  jsonFailure,
  jsonSuccess,
  readCommandBody,
} from '@/lib/alfazaa/server/http';
import { commandAlfazaa, readAlfazaa } from '@/lib/alfazaa/server/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const identity = await alfazaaIdentity();
    await alfazaaRateLimit(identity.id, false);
    return jsonSuccess(await readAlfazaa(identity));
  } catch (error) {
    return jsonFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const identity = await alfazaaIdentity();
    await alfazaaRateLimit(identity.id, true);
    return jsonSuccess(await commandAlfazaa(identity, await readCommandBody(request)));
  } catch (error) {
    return jsonFailure(error);
  }
}

import { NextResponse } from 'next/server';
import { CommunityError } from './service';

export function assertCommunityOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const expected = new URL(process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? request.url).origin;
  if (!origin || origin !== expected || request.headers.get('sec-fetch-site') === 'cross-site')
    throw new CommunityError('CROSS_ORIGIN', 403);
}
export async function readCommunityJson(request: Request) {
  assertCommunityOrigin(request);
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json')
    throw new CommunityError('JSON_REQUIRED', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new CommunityError('INVALID_JSON');
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 300000) {
      await reader.cancel();
      throw new CommunityError('PAYLOAD_TOO_LARGE', 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new CommunityError('INVALID_JSON');
  }
}
export async function communityResponse(run: () => Promise<unknown>) {
  try {
    return NextResponse.json(
      { ok: true, data: await run() },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    if (error instanceof CommunityError)
      return NextResponse.json({ ok: false, error: error.code }, { status: error.status });
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002')
      return NextResponse.json({ ok: false, error: 'ALREADY_EXISTS' }, { status: 409 });
    return NextResponse.json({ ok: false, error: 'COMMUNITY_UNAVAILABLE' }, { status: 503 });
  }
}
export function parseAccountNumber(value: string) {
  if (!/^(?:1|[1-9]\d{8})$/.test(value)) throw new CommunityError('NOT_FOUND', 404);
  return Number(value);
}

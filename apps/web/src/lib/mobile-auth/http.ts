import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { ZodType } from 'zod';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache' };
const MAX_AUTH_BODY_BYTES = 16 * 1024;

export function mobileRequestId(request: Request) {
  const supplied = request.headers.get('x-request-id')?.trim();
  return supplied && /^[A-Za-z0-9_-]{8,80}$/.test(supplied) ? supplied : randomUUID();
}

export function mobileClientIp(request: Request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim().slice(0, 80) ||
    request.headers.get('x-real-ip')?.trim().slice(0, 80) ||
    'unknown'
  );
}

export async function parseMobileJson<T>(request: Request, schema: ZodType<T>) {
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > MAX_AUTH_BODY_BYTES) return null;
  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_AUTH_BODY_BYTES) return null;
    const body: unknown = JSON.parse(rawBody);
    const parsed = schema.safeParse(body);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function mobileSuccess<T>(data: T, requestId: string, status = 200) {
  return NextResponse.json(
    { ok: true as const, data, requestId },
    { status, headers: NO_STORE_HEADERS },
  );
}

export function mobileFailure(code: string, message: string, requestId: string, status: number) {
  return NextResponse.json(
    { ok: false as const, error: { code, message, requestId } },
    { status, headers: NO_STORE_HEADERS },
  );
}

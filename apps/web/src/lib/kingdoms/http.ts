import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export class KingdomsHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function assertSameOrigin(
  request: Request,
  configuredOrigin = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL,
) {
  // App Router can construct request.url using the internal upstream host.
  // Use the server's canonical auth origin, never client forwarding headers.
  const expected = new URL(configuredOrigin || request.url).origin;
  if (request.headers.get('origin') !== expected) {
    throw new KingdomsHttpError(403, 'مصدر الطلب غير مسموح. حدّث الصفحة وحاول مجددًا.');
  }
}

export async function readCommandBody(request: Request): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    throw new KingdomsHttpError(415, 'صيغة الطلب غير مدعومة.');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new KingdomsHttpError(400, 'الطلب فارغ.');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 32_768) {
        await reader.cancel();
        throw new KingdomsHttpError(413, 'حجم الطلب أكبر من المسموح.');
      }
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof KingdomsHttpError) throw error;
    throw new KingdomsHttpError(400, 'بيانات الطلب غير صالحة.');
  } finally {
    reader.releaseLock();
  }
}

export function stableFingerprint(value: unknown): string {
  const canonical = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(canonical);
    if (item !== null && typeof item === 'object') {
      return Object.fromEntries(
        Object.entries(item)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, val]) => [key, canonical(val)]),
      );
    }
    return item;
  };
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}

export function jsonSuccess(data: unknown) {
  return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'no-store' } });
}

export function jsonFailure(error: unknown) {
  if (error instanceof KingdomsHttpError)
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  if (error instanceof ZodError)
    return NextResponse.json(
      { success: false, error: 'تحقق من الحقول المطلوبة وحدود الأعداد.' },
      { status: 400 },
    );
  // Engine business errors have no database or request internals.
  if (error instanceof Error && error.name === 'KingdomsError')
    return NextResponse.json({ success: false, error: error.message }, { status: 409 });
  console.error('[kingdoms] request failed', error instanceof Error ? error.name : 'UnknownError');
  return NextResponse.json(
    { success: false, error: 'تعذّر إتمام الطلب الآن. حاول مجددًا بالمفتاح نفسه.' },
    { status: 503 },
  );
}

import { NextResponse } from 'next/server';
import { z, ZodError } from 'zod';

export class ApiHttpError extends Error {
  constructor(
    public status: number,
    message: string,
    // Keep the legacy response code for existing clients.
    public code = 'VOICE_ERROR',
  ) {
    super(message);
  }
}
export function assertApiOrigin(request: Request) {
  const expected = new URL(process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? request.url).origin;
  if (request.headers.get('origin') !== expected)
    throw new ApiHttpError(403, 'مصدر الطلب غير مسموح.', 'ORIGIN');
}
export async function readJsonBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')
    throw new ApiHttpError(415, 'صيغة الطلب غير مدعومة.');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiHttpError(400, 'الطلب فارغ.');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 16_384) {
        await reader.cancel();
        throw new ApiHttpError(413, 'حجم الطلب أكبر من المسموح.');
      }
      chunks.push(part.value);
    }
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new ApiHttpError(400, 'بيانات الطلب غير صالحة.');
    }
    return schema.parse(body);
  } finally {
    reader.releaseLock();
  }
}
export function jsonSuccess(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
export function jsonFailure(error: unknown) {
  if (error instanceof ApiHttpError)
    return jsonSuccess({ error: error.message, code: error.code }, error.status);
  if (error instanceof ZodError)
    return jsonSuccess({ error: 'تحقق من الحقول المطلوبة وحدودها.', code: 'INVALID_INPUT' }, 400);
  const code =
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string' &&
    /^P\d{4}$/.test(error.code)
      ? error.code
      : 'UNKNOWN';
  console.error(
    '[api] request failed',
    error instanceof Error ? error.name : 'UnknownError',
    code,
  );
  return jsonSuccess(
    { error: 'تعذّر إتمام الطلب. حاول مجددًا بعد قليل.', code: 'UNAVAILABLE' },
    503,
  );
}

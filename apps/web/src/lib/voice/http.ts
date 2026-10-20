import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getCurrentSession } from '@/lib/auth/session';
import { VoiceError } from './errors';

export type VoiceIdentity = { userId: string; tokenVersion: number };
export async function voiceIdentity(): Promise<VoiceIdentity> {
  const user = (await getCurrentSession())?.user;
  if (!user?.id || !Number.isInteger(user.tokenVersion))
    throw new VoiceError(401, 'سجّل الدخول للانضمام إلى الغرف الصوتية.', 'UNAUTHENTICATED');
  return { userId: user.id, tokenVersion: user.tokenVersion };
}

export function assertVoiceOrigin(request: Request) {
  const expected = new URL(process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? request.url).origin;
  if (
    request.headers.get('origin') !== expected ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  )
    throw new VoiceError(403, 'مصدر الطلب غير مسموح.', 'ORIGIN_REJECTED');
}

export async function readVoiceBody(request: Request): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')
    throw new VoiceError(415, 'صيغة الطلب غير مدعومة.');
  const reader = request.body?.getReader();
  if (!reader) throw new VoiceError(400, 'بيانات الطلب مفقودة.');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 32_768) {
        await reader.cancel();
        throw new VoiceError(413, 'حجم الطلب أكبر من المسموح.');
      }
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof VoiceError) throw error;
    throw new VoiceError(400, 'بيانات الطلب غير صالحة.');
  } finally {
    reader.releaseLock();
  }
}

const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
export function voiceSuccess(data: object, status = 200) {
  return NextResponse.json({ ok: true, ...data }, { status, headers });
}
export function voiceFailure(error: unknown) {
  if (error instanceof VoiceError)
    return NextResponse.json(
      { ok: false, error: error.message, code: error.code },
      { status: error.status, headers },
    );
  if (error instanceof ZodError)
    return NextResponse.json(
      { ok: false, error: 'تحقق من الحقول المطلوبة وحدود البيانات.', code: 'INVALID_REQUEST' },
      { status: 400, headers },
    );
  return NextResponse.json(
    { ok: false, error: 'تعذّر الاتصال بالغرفة. حاول مجددًا.', code: 'VOICE_UNAVAILABLE' },
    { status: 503, headers },
  );
}

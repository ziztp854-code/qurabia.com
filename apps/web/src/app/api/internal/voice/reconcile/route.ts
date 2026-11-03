import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { jsonFailure, readVoiceBody, VoiceHttpError } from '@/lib/voice/http';
import { processNextVoiceMediaJob } from '@/lib/voice/media-sync-queue';
import { processNextAccountVoiceOutboxJob } from '@/lib/voice/account-voice-outbox';
import { readVoiceBacklog } from '@/lib/voice/account-voice-outbox-health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const requestSchema = z.object({ limit: z.number().int().min(1).max(10) }).strict();

export async function POST(request: Request) {
  try {
    const secret = process.env.VOICE_RECONCILE_SECRET;
    if (!secret || secret.length < 32)
      throw new VoiceHttpError(503, 'خدمة متابعة الصوت غير مهيأة.');
    const expected = Buffer.from(`Bearer ${secret}`);
    const actual = Buffer.from(request.headers.get('authorization') ?? '');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
      throw new VoiceHttpError(401, 'غير مصرح.');
    await readVoiceBody(request, requestSchema);
    const account = await processNextAccountVoiceOutboxJob();
    const room = await processNextVoiceMediaJob();
    const backlog = await readVoiceBacklog();
    const data = { processed: room.processed, failed: room.failed + (account === 'failed' ? 1 : 0), backlog };
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return jsonFailure(error);
  }
}

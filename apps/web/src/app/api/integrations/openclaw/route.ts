import { checkRateLimit } from '@/lib/auth/rate-limit';
import {
  authorizeService,
  failure,
  OpenClawError,
  readBody,
  toolRequestSchema,
} from '@/lib/openclaw-admin/protocol';
import { dispatchTool } from '@/lib/openclaw-admin/service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    authorizeService(request.headers.get('authorization'));
    if (!(await checkRateLimit('openclaw-service:qurabia', 30, 60_000)))
      throw new OpenClawError(429, 'تجاوزت حد الطلبات.');
    const input = toolRequestSchema.parse(await readBody(request));
    return Response.json(
      { ok: true, data: await dispatchTool(input) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}

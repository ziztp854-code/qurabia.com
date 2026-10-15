import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export class OpenClawError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export const toolRequestSchema = z.discriminatedUnion('tool', [
  z.object({ tool: z.literal('site_status'), args: z.object({}).strict() }).strict(),
  z.object({ tool: z.literal('question_stats'), args: z.object({}).strict() }).strict(),
  z
    .object({
      tool: z.literal('propose_question_status'),
      args: z
        .object({
          requestId: z.string().uuid(),
          questionId: z.string().min(1).max(191),
          nextStatus: z.enum(['DRAFT', 'ARCHIVED']),
          reason: z.string().trim().min(1).max(500),
        })
        .strict(),
    })
    .strict(),
]);
export const decisionSchema = z
  .object({
    id: z.string().regex(/^ocp_[0-9a-f-]{36}$/),
    decision: z.enum(['approve', 'reject']),
  })
  .strict();
export type ToolRequest = z.infer<typeof toolRequestSchema>;
export function assertEnabled(env: Readonly<Record<string, string | undefined>> = process.env) {
  if (env.QURABIA_OPENCLAW_ENABLED !== 'true') throw new OpenClawError(503, 'الربط غير مفعّل.');
}
export function authorizeService(
  header: string | null,
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  assertEnabled(env);
  const secret = env.QURABIA_OPENCLAW_SERVICE_TOKEN ?? '';
  const supplied = header?.startsWith('Bearer ') ? header.slice(7) : '';
  if (secret.length < 32 || secret.length > 512 || supplied.length > 512)
    throw new OpenClawError(401, 'غير مصرح.');
  const left = Buffer.from(secret);
  const right = Buffer.from(supplied);
  if (left.length !== right.length || !timingSafeEqual(left, right))
    throw new OpenClawError(401, 'غير مصرح.');
}
export async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new OpenClawError(400, 'طلب غير صالح.');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        throw new OpenClawError(413, 'الطلب كبير جدًا.');
      }
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch (error) {
    if (error instanceof OpenClawError) throw error;
    throw new OpenClawError(400, 'طلب غير صالح.');
  } finally {
    reader.releaseLock();
  }
}
export function failure(error: unknown) {
  if (error instanceof OpenClawError)
    return Response.json({ ok: false, error: error.message }, { status: error.status });
  if (error instanceof z.ZodError)
    return Response.json({ ok: false, error: 'طلب غير صالح.' }, { status: 400 });
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
  return Response.json(
    {
      ok: false,
      error:
        code === 'P2034' || code === 'P2002'
          ? 'تعارض في الطلب. أعد المحاولة.'
          : 'تعذّر إكمال الطلب.',
    },
    { status: code === 'P2034' || code === 'P2002' ? 409 : 503 },
  );
}

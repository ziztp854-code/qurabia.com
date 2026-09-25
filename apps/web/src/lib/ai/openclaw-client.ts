import 'server-only';
import { z } from 'zod';

export class OpenClawClientError extends Error {
  constructor(
    message: string,
    readonly code: 'CONFIG' | 'UPSTREAM' | 'INVALID_RESPONSE',
  ) {
    super(message);
    this.name = 'OpenClawClientError';
  }
}

type Options = { systemPrompt: string; prompt: string; maxOutputTokens: number; timeoutMs: number };
const MAX_RESPONSE_BYTES = 65_536;

function configuration() {
  const token = process.env.OPENCLAW_GATEWAY_TOKEN?.trim();
  const agent = process.env.OPENCLAW_AGENT_ID?.trim();
  try {
    const url = new URL(process.env.OPENCLAW_GATEWAY_URL || '');
    const loopback = ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname);
    if (
      !token ||
      !agent ||
      !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(agent) ||
      ['main', 'default'].includes(agent.toLowerCase()) ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    ) {
      throw new Error('Invalid configuration');
    }
    return { endpoint: new URL('/v1/chat/completions', url).toString(), token, agent };
  } catch {
    throw new OpenClawClientError('خدمة المساعد غير مهيأة بعد.', 'CONFIG');
  }
}

async function readPayload(response: Response): Promise<unknown> {
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new Error('Response too large');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty response');
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error('Response too large');
      }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    reader.releaseLock();
  }
}

export async function generateOpenClawStructured<T>(
  schema: z.ZodType<T>,
  options: Options,
): Promise<T> {
  if (process.env.AI_GENERATION_DISABLED === 'true') {
    throw new OpenClawClientError('تم تعطيل المساعد مؤقتًا.', 'CONFIG');
  }
  const config = configuration();
  let response: Response;
  try {
    response = await fetch(config.endpoint, {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `openclaw:${config.agent}`,
        stream: false,
        tool_choice: 'none',
        max_tokens: options.maxOutputTokens,
        // No user or session key: each request gets an isolated gateway session.
        // Internal tools MUST also be denied in the dedicated gateway's policy.
        messages: [
          {
            role: 'system',
            content: `${options.systemPrompt}\nأعد كائن JSON فقط دون تنسيق Markdown، مطابقًا لهذا المخطط:\n${JSON.stringify(z.toJSONSchema(schema, { target: 'draft-7' }))}`,
          },
          { role: 'user', content: options.prompt },
        ],
      }),
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch {
    throw new OpenClawClientError('تعذّر الاتصال بالمساعد الآن. حاول لاحقًا.', 'UPSTREAM');
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new OpenClawClientError('تعذّر الاتصال بالمساعد الآن. حاول لاحقًا.', 'UPSTREAM');
  }
  try {
    const envelope = z
      .object({
        choices: z.array(z.object({ message: z.object({ content: z.string().min(1) }) })).min(1),
      })
      .parse(await readPayload(response));
    return schema.parse(JSON.parse(envelope.choices[0].message.content));
  } catch {
    throw new OpenClawClientError('تعذّر فهم رد المساعد. حاول مجددًا.', 'INVALID_RESPONSE');
  }
}

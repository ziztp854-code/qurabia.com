import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { generateOpenClawStructured } from './openclaw-client';

const schema = z.object({ reply: z.string().max(240) });
const options = {
  systemPrompt: 'Help with games.',
  prompt: 'How do I join?',
  maxOutputTokens: 220,
  timeoutMs: 20_000,
};
const fetchMock = vi.fn();
const response = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }));

describe('OpenClaw server adapter', () => {
  beforeEach(() => {
    vi.stubEnv('OPENCLAW_GATEWAY_URL', 'https://private-gateway.example');
    vi.stubEnv('OPENCLAW_GATEWAY_TOKEN', 'test-only-token');
    vi.stubEnv('OPENCLAW_AGENT_ID', 'tahaddi-support');
    vi.stubEnv('AI_GENERATION_DISABLED', 'false');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(response('{"reply":"Welcome"}'));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it('routes to the dedicated agent without sharing a session or account identity', async () => {
    await expect(generateOpenClawStructured(schema, options)).resolves.toEqual({
      reply: 'Welcome',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://private-gateway.example/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer test-only-token');
    expect(init.redirect).toBe('error');
    expect(init.cache).toBe('no-store');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('openclaw:tahaddi-support');
    expect(body.user).toBeUndefined();
    expect(init.headers['x-openclaw-session-key']).toBeUndefined();
    expect(body.tool_choice).toBe('none');
    expect(body.messages[0].content).toContain('JSON');
    expect(body.messages[1].content).toBe(options.prompt);
  });

  it.each(['OPENCLAW_GATEWAY_URL', 'OPENCLAW_GATEWAY_TOKEN', 'OPENCLAW_AGENT_ID'])(
    'fails closed without %s',
    async (name) => {
      vi.stubEnv(name, '');
      await expect(generateOpenClawStructured(schema, options)).rejects.toMatchObject({
        code: 'CONFIG',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it.each([
    'http://public.example',
    'https://user:pass@example.com',
    'file:///tmp/a',
    'https://example.com?token=secret',
    'https://example.com/#x',
  ])('rejects unsafe endpoint %s', async (url) => {
    vi.stubEnv('OPENCLAW_GATEWAY_URL', url);
    await expect(generateOpenClawStructured(schema, options)).rejects.toMatchObject({
      code: 'CONFIG',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('permits loopback HTTP for local verification', async () => {
    vi.stubEnv('OPENCLAW_GATEWAY_URL', 'http://127.0.0.1:18789');
    await generateOpenClawStructured(schema, options);
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:18789/v1/chat/completions');
  });
  it('honors the global disable switch', async () => {
    vi.stubEnv('AI_GENERATION_DISABLED', 'true');
    await expect(generateOpenClawStructured(schema, options)).rejects.toMatchObject({
      code: 'CONFIG',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(['main', 'default', '../main'])(
    'requires a dedicated agent rather than %s',
    async (agent) => {
      vi.stubEnv('OPENCLAW_AGENT_ID', agent);
      await expect(generateOpenClawStructured(schema, options)).rejects.toMatchObject({
        code: 'CONFIG',
      });
    },
  );
  it('does not expose upstream error text', async () => {
    fetchMock.mockResolvedValue(new Response('private-secret', { status: 500 }));
    await expect(generateOpenClawStructured(schema, options)).rejects.toMatchObject({
      code: 'UPSTREAM',
    });
    await expect(generateOpenClawStructured(schema, options)).rejects.not.toThrow('private-secret');
  });
  it('handles connection failure', async () => {
    fetchMock.mockRejectedValue(new Error('private-secret'));
    await expect(generateOpenClawStructured(schema, options)).rejects.toMatchObject({
      code: 'UPSTREAM',
    });
  });
  it.each(['not-json', '{"reply":123}', '{"reply":"' + 'a'.repeat(241) + '"}'])(
    'rejects malformed or invalid generated content',
    async (content) => {
      fetchMock.mockResolvedValue(response(content));
      await expect(generateOpenClawStructured(schema, options)).rejects.toMatchObject({
        code: 'INVALID_RESPONSE',
      });
    },
  );
  it('rejects oversized responses without trusting Content-Length', async () => {
    fetchMock.mockResolvedValue(new Response('a'.repeat(65_537)));
    await expect(generateOpenClawStructured(schema, options)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
});

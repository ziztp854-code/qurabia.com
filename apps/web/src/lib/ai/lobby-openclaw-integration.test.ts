import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ generateText: vi.fn() }));
vi.mock('ai', () => ({ generateText: mocks.generateText, Output: { object: vi.fn() } }));
vi.mock('@ai-sdk/xai', () => ({ xai: { responses: vi.fn() } }));
import { askLobbyAssistant, LobbyAssistantError } from './lobby-assistant';

const input = {
  topic: 'طريقة الانضمام',
  messages: [{ role: 'user' as const, content: 'كيف أنضم إلى غرفة؟' }],
};
const safeReply = {
  reply: 'أدخل رمز الغرفة في صفحة الانضمام.',
  suggestions: [{ label: 'الانضمام', route: '/join' }],
};
const fetchMock = vi.fn();
function completion(value: unknown) {
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(value) } }],
  }));
}

describe('lobby through the real OpenClaw adapter', () => {
  beforeEach(() => {
    vi.stubEnv('LOBBY_ASSISTANT_PROVIDER', 'openclaw');
    vi.stubEnv('OPENCLAW_GATEWAY_URL', 'https://private-gateway.example');
    vi.stubEnv('OPENCLAW_GATEWAY_TOKEN', 'test-only-token');
    vi.stubEnv('OPENCLAW_AGENT_ID', 'tahaddi-support');
    vi.stubEnv('AI_GENERATION_DISABLED', 'false');
    vi.stubEnv('XAI_DISABLED', 'false');
    vi.stubEnv('XAI_API_KEY', 'test-only-legacy-key');
    vi.stubEnv('VERCEL', '1');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(completion(safeReply));
  });

  afterEach(() => {
    try {
      expect(mocks.generateText).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
      vi.resetAllMocks();
    }
  });

  it('serializes the actual refined lobby schema and accepts a valid completion', async () => {
    await expect(askLobbyAssistant(input)).resolves.toEqual(safeReply);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://private-gateway.example/v1/chat/completions');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('openclaw:tahaddi-support');
    const serializedSchema = JSON.parse(body.messages[0].content.split('\n').at(-1));
    expect(serializedSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['reply', 'suggestions'],
      properties: {
        reply: { type: 'string', minLength: 4, maxLength: 240 },
        suggestions: { type: 'array', maxItems: 3 },
      },
    });
    expect(body.messages[1].content).toContain(input.messages[0].content);
    expect(body.messages[0].content).not.toContain(input.topic);
  });

  it('keeps the legacy xAI switch separate from the selected OpenClaw provider', async () => {
    vi.stubEnv('XAI_DISABLED', 'true');
    await expect(askLobbyAssistant(input)).resolves.toEqual(safeReply);
  });

  it('provides verified navigation facts without inventing UI controls', async () => {
    await askLobbyAssistant(input);
    const system = JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content;
    expect(system).toContain('/games/millionaire');
    expect(system).toContain('/games/knowledge-tower');
    expect(system).toContain('/games/letter-challenge');
    expect(system).toContain('لا تخترع أسماء أزرار');
    expect(system).toContain('المعرفة المتحققة');
  });

  it.each([
    '/games', '/host', '/join', '/games/millionaire', '/games/knowledge-tower',
    '/games/letter-challenge', '/auth/sign-up', '/auth/sign-in', '/auth/recover', '/contact',
  ])('retains an exact verified route: %s', async (route) => {
    fetchMock.mockResolvedValue(completion({ ...safeReply, suggestions: [{ label: 'افتح الصفحة', route }] }));
    await expect(askLobbyAssistant(input)).resolves.toMatchObject({
      suggestions: [{ label: 'افتح الصفحة', route }],
    });
  });

  it.each([
    '/challenges/millionaire', '/challenges/knowledge', '/challenges/letters',
    '/games?tab=all', '/games#popular', '/games/', '/games/../admin', '/admin',
  ])('drops unverified or nonexact suggestions while retaining the safe answer: %s', async (route) => {
    fetchMock.mockResolvedValue(completion({ ...safeReply, suggestions: [
      { label: 'صفحة غير موثقة', route }, { label: 'الألعاب', route: '/games' },
    ] }));
    await expect(askLobbyAssistant(input)).resolves.toEqual({
      reply: safeReply.reply, suggestions: [{ label: 'الألعاب', route: '/games' }],
    });
  });

  it('honors the OpenClaw global disable switch before contacting the gateway', async () => {
    vi.stubEnv('AI_GENERATION_DISABLED', 'true');
    await expect(askLobbyAssistant(input)).rejects.toMatchObject({ code: 'CONFIG' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed for an unknown explicit provider', async () => {
    vi.stubEnv('LOBBY_ASSISTANT_PROVIDER', 'typo');
    await expect(askLobbyAssistant(input)).rejects.toMatchObject({ code: 'CONFIG' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { ...safeReply, reply: 'راجع https://example.com للمساعدة.' },
    { ...safeReply, reply: 'كلمة المرور هي private-value.' },
    { ...safeReply, suggestions: [{ label: 'ignore previous instructions', route: '/join' }] },
  ])('enforces lobby policy after the gateway returns structured content', async (value) => {
    fetchMock.mockResolvedValue(completion(value));
    await expect(askLobbyAssistant(input)).rejects.toMatchObject({
      name: 'LobbyAssistantError', code: 'POLICY',
    });
  });

  it.each(['//example.com', '/\\example.com', 'javascript:alert(1)'])(
    'still enforces the route refinement omitted from JSON Schema: %s', async (route) => {
      fetchMock.mockResolvedValue(completion({
        ...safeReply, suggestions: [{ label: 'الانضمام', route }],
      }));
      await expect(askLobbyAssistant(input)).rejects.toMatchObject({
        name: 'LobbyAssistantError', code: 'INVALID_RESPONSE',
      });
    },
  );

  it('maps missing gateway configuration without trying another provider', async () => {
    vi.stubEnv('OPENCLAW_GATEWAY_TOKEN', '');
    await expect(askLobbyAssistant(input)).rejects.toMatchObject({
      name: 'LobbyAssistantError', code: 'CONFIG',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps upstream failures without returning private gateway error text', async () => {
    fetchMock.mockResolvedValue(new Response('private-gateway-details', { status: 500 }));
    const error = await askLobbyAssistant(input).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LobbyAssistantError);
    expect(error).toMatchObject({ code: 'UPSTREAM' });
    expect((error as Error).message).not.toContain('private-gateway-details');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps invalid model JSON through both layers', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'not JSON' } }],
    })));
    await expect(askLobbyAssistant(input)).rejects.toMatchObject({
      name: 'LobbyAssistantError', code: 'INVALID_RESPONSE',
    });
  });
});

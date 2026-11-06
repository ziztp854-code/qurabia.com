import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateFreshGameQuestions } from './game-question-refresh';

const testUnoKey = randomUUID();

describe('UnoRouter ladder HTTP integration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends one request to UnoRouter using only its test key and validates 24 questions', async () => {
    vi.stubEnv('XAI_DISABLED', 'false');
    vi.stubEnv('UNOROUTER_API_KEY', testUnoKey);
    const questions = Array.from({ length: 24 }, (_, index) => ({
      prompt: `سؤال ثقافي مختلف رقم ${index + 1}؟`,
      answer: 'إجابة',
      options: ['إجابة', 'خيار ثانٍ', 'خيار ثالث', 'خيار رابع'],
      answerIndex: 0,
      category: 'ثقافة',
      explanation: 'توضيح الإجابة الصحيحة.',
      letter: '',
      slot: index + 1,
      difficulty: index < 8 ? 'EASY' : index < 16 ? 'MEDIUM' : 'HARD',
    }));
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: 'test-response',
            object: 'chat.completion',
            created: 1700000000,
            model: 'glm-5.3-flash:free',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: JSON.stringify({ questions }) },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 20, completion_tokens: 200, total_tokens: 220 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(
      await generateFreshGameQuestions({
        game: 'ladder',
        topic: 'ثقافة عامة',
        excludePrompts: ['نص مستخدم آخر خاص'],
      }),
    ).toEqual(questions);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.unorouter.com/v1/chat/completions');
    expect(new Headers(request.headers).get('authorization')).toBe(`Bearer ${testUnoKey}`);
    const body = JSON.parse(String(request.body));
    expect(JSON.stringify(body.messages)).not.toContain('نص مستخدم آخر خاص');
    expect(body.model).toBe('glm-5.3-flash:free');
    expect(body.models).toBeUndefined();
    expect(body.max_tokens).toBe(8192);
    expect(body.reasoning_effort).toBe('low');
    expect(body.response_format.type).toBe('json_schema');
  });

  it('makes no automatic retry or other-provider request after rate limiting', async () => {
    vi.stubEnv('XAI_DISABLED', 'false');
    vi.stubEnv('UNOROUTER_API_KEY', testUnoKey);
    vi.stubEnv('OPENROUTER_API_KEY', 'test-only-openrouter');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: 'private upstream content' } }), {
          status: 429,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      generateFreshGameQuestions({ game: 'ladder', topic: 'ثقافة عامة' }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

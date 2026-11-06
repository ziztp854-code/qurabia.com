import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateFreshGameQuestions } from './game-question-refresh';

describe('OpenRouter request for ladder questions', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('sends a free model and structured output request and validates its response', async () => {
    vi.stubEnv('XAI_DISABLED', 'false');
    vi.stubEnv('OPENROUTER_API_KEY', 'test-only-key');
    const questions = Array.from({ length: 24 }, (_, index) => ({
      prompt: `سؤال ثقافي مختلف رقم ${index + 1}؟`,
      answer: 'إجابة',
      options: ['إجابة', 'خيار ثانٍ', 'خيار ثالث', 'خيار رابع'],
      answerIndex: 0,
      category: 'ثقافة',
      explanation: 'توضيح الإجابة الصحيحة.',
      letter: '',
      slot: index + 1,
      difficulty: 'EASY',
    }));
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: 'test-response',
            object: 'chat.completion',
            created: 1700000000,
            model: 'openrouter/free',
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
    expect(await generateFreshGameQuestions({ game: 'ladder', topic: 'ثقافة عامة' })).toEqual(
      questions,
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    const body = JSON.parse(String(request.body));
    expect(body.model).toBe('openrouter/free');
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.schema).toBeDefined();
  });
});

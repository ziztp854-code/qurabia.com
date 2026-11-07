import { afterEach, expect, it, vi } from 'vitest';
import { generateFreshGameQuestions } from './game-question-refresh';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('sends a bounded JSON-mode request to Kimi without sending excluded questions', async () => {
  vi.stubEnv('XAI_DISABLED', 'false');
  vi.stubEnv('KIMI_API_KEY', 'test-only-kimi');
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
          model: 'kimi-k3.1-pro',
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
      excludePrompts: ['نص خاص مستبعد'],
    }),
  ).toEqual(questions);
  expect(fetchMock).toHaveBeenCalledOnce();
  const [url, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('https://api.moonshot.ai/v1/chat/completions');
  expect(new Headers(request.headers).get('authorization')).toBe('Bearer test-only-kimi');
  const body = JSON.parse(String(request.body));
  expect(JSON.stringify(body.messages)).not.toContain('نص خاص مستبعد');
  expect(body.model).toBe('kimi-k3.1-pro');
  expect(body.reasoning_effort).toBe('low');
  expect(body.response_format.type).toBe('json_object');
  expect(body.max_tokens).toBe(8192);
});

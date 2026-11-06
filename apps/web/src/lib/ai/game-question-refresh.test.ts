import { randomUUID } from 'node:crypto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  responses: vi.fn(() => ({})),
  openrouterModel: vi.fn(() => ({ provider: 'openrouter' })),
  createCompatible: vi.fn(),
}));
vi.mock('ai', () => ({
  generateText: mocks.generateText,
  Output: { object: (value: unknown) => value },
}));
vi.mock('@ai-sdk/xai', () => ({ xai: { responses: mocks.responses } }));
vi.mock('@ai-sdk/openai-compatible', () => ({ createOpenAICompatible: mocks.createCompatible }));
import { generateFreshGameQuestions, validateGameQuestionBatch } from './game-question-refresh';
import {
  generatedGameQuestionsSchema,
  type GeneratedGameQuestion,
} from './game-question-refresh-contract';
import { LETTER_QUESTION_POOL } from '@/lib/letter-game/questions';

const testUnoKey = randomUUID();

const question = (index: number): GeneratedGameQuestion => ({
  prompt: `سؤال ثقافي مختلف رقم ${index}؟`,
  answer: 'إجابة',
  options: ['إجابة', 'خيار ثانٍ', 'خيار ثالث', 'خيار رابع'],
  answerIndex: 0,
  category: 'ثقافة',
  explanation: 'توضيح الإجابة الصحيحة.',
  letter: '',
  slot: index,
  difficulty: 'EASY',
});
const ladderBatch = (difficulty: 'EASY' | 'MEDIUM' | 'HARD', offset: number) =>
  Array.from({ length: 8 }, (_, i) => ({ ...question(offset + i + 1), difficulty }));
describe('fresh game question generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generateText.mockReset();
    vi.stubEnv('XAI_API_KEY', 'test-only');
    vi.stubEnv('XAI_DISABLED', 'false');
    vi.stubEnv('AI_GATEWAY_API_KEY', '');
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('AI_QUESTIONS_MODEL', '');
    vi.stubEnv('AI_GATEWAY_MODEL', '');
    vi.stubEnv('OPENROUTER_API_KEY', '');
    vi.stubEnv('UNOROUTER_API_KEY', '');
    mocks.createCompatible.mockReturnValue(mocks.openrouterModel);
  });
  afterEach(() => vi.unstubAllEnvs());
  it('generates a complete validated ladder of levels without provider storage', async () => {
    const questions = Array.from({ length: 15 }, (_, index) => question(index + 1));
    mocks.generateText.mockResolvedValue({ output: { questions } });
    expect(await generateFreshGameQuestions({ game: 'millionaire', topic: 'ثقافة عامة' })).toEqual(
      questions,
    );
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        providerOptions: { xai: { reasoningEffort: 'low', store: false } },
      }),
    );
  });
  it('keeps the configured disable switch authoritative', async () => {
    vi.stubEnv('XAI_DISABLED', 'true');
    await expect(
      generateFreshGameQuestions({ game: 'millionaire', topic: 'ثقافة عامة' }),
    ).rejects.toMatchObject({ code: 'CONFIG' });
    expect(mocks.generateText).not.toHaveBeenCalled();
  });
  it('fails closed without UnoRouter for ladder even if other providers are configured', async () => {
    vi.stubEnv('UNOROUTER_API_KEY', '');
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter');
    vi.stubEnv('AI_GATEWAY_API_KEY', 'test-gateway');
    await expect(
      generateFreshGameQuestions({ game: 'ladder', topic: 'ثقافة عامة' }),
    ).rejects.toMatchObject({ code: 'CONFIG' });
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.responses).not.toHaveBeenCalled();
  });
  it('generates all ladder questions with a single UnoRouter request', async () => {
    vi.stubEnv('UNOROUTER_API_KEY', testUnoKey);
    vi.stubEnv('XAI_API_KEY', '');
    const questions = [
      ...ladderBatch('EASY', 0),
      ...ladderBatch('MEDIUM', 8),
      ...ladderBatch('HARD', 16),
    ];
    mocks.generateText.mockResolvedValue({ finishReason: 'stop', output: { questions } });
    expect(await generateFreshGameQuestions({ game: 'ladder', topic: 'ثقافة عامة' })).toEqual(
      questions,
    );
    expect(mocks.createCompatible).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'unorouter',
        baseURL: 'https://api.unorouter.com/v1',
        apiKey: testUnoKey,
        supportsStructuredOutputs: true,
      }),
    );
    expect(mocks.openrouterModel).toHaveBeenCalledOnce();
    expect(mocks.openrouterModel).toHaveBeenCalledWith('glm-5.3-flash:free');
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        maxRetries: 0,
        providerOptions: { unorouter: { reasoningEffort: 'low' } },
      }),
    );
    expect(mocks.generateText).toHaveBeenCalledOnce();
  });
  it.each(['length', 'incomplete', 'duplicate', 'difficulty', 'upstream'])(
    'rejects an UnoRouter %s failure without falling back',
    async (failure) => {
      vi.stubEnv('UNOROUTER_API_KEY', testUnoKey);
      vi.stubEnv('OPENROUTER_API_KEY', 'test-only-openrouter');
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      let questions = [
        ...ladderBatch('EASY', 0),
        ...ladderBatch('MEDIUM', 8),
        ...ladderBatch('HARD', 16),
      ];
      if (failure === 'incomplete') questions = questions.slice(0, 23);
      if (failure === 'duplicate')
        questions[8] = { ...questions[8]!, prompt: questions[0]!.prompt };
      if (failure === 'difficulty') questions[16] = { ...questions[16]!, difficulty: 'EASY' };
      if (failure === 'upstream')
        mocks.generateText.mockRejectedValue(new Error('secret upstream error'));
      else
        mocks.generateText.mockResolvedValue({
          finishReason: failure === 'length' ? 'length' : 'stop',
          output: { questions },
        });
      await expect(
        generateFreshGameQuestions({ game: 'ladder', topic: 'ثقافة عامة' }),
      ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
      expect(mocks.generateText).toHaveBeenCalledOnce();
      expect(mocks.openrouterModel).toHaveBeenCalledOnce();
      expect(mocks.openrouterModel).toHaveBeenCalledWith('glm-5.3-flash:free');
      expect(mocks.responses).not.toHaveBeenCalled();
      expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
      log.mockRestore();
    },
  );
  it('rejects UnoRouter questions repeating locally excluded prompts', async () => {
    vi.stubEnv('UNOROUTER_API_KEY', testUnoKey);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const questions = [
      ...ladderBatch('EASY', 0),
      ...ladderBatch('MEDIUM', 8),
      ...ladderBatch('HARD', 16),
    ];
    mocks.generateText.mockResolvedValue({ finishReason: 'stop', output: { questions } });
    await expect(
      generateFreshGameQuestions({
        game: 'ladder',
        topic: 'ثقافة عامة',
        excludePrompts: [questions[0]!.prompt],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    log.mockRestore();
  });
  it('logs only bounded UnoRouter failure information', async () => {
    vi.stubEnv('UNOROUTER_API_KEY', testUnoKey);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.generateText.mockRejectedValue(
      Object.assign(new Error('private upstream content'), {
        name: 'AI_APICallError',
        statusCode: 429,
        responseBody: 'private upstream content',
      }),
    );
    await expect(
      generateFreshGameQuestions({ game: 'ladder', topic: 'private user topic' }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(log).toHaveBeenCalledWith('[game-questions-unorouter]', {
      stage: 'generation',
      errorClass: 'AI_APICallError',
      statusCode: 429,
      finishReason: null,
      outputTokens: null,
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain('private');
    expect(JSON.stringify(log.mock.calls)).not.toContain(testUnoKey);
    log.mockRestore();
  });
  it('keeps other games on their existing provider when UnoRouter is configured', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter');
    vi.stubEnv('UNOROUTER_API_KEY', testUnoKey);
    const questions = Array.from({ length: 15 }, (_, index) => question(index + 1));
    mocks.generateText.mockResolvedValue({ output: { questions } });
    expect(await generateFreshGameQuestions({ game: 'millionaire', topic: 'ثقافة عامة' })).toEqual(
      questions,
    );
    expect(mocks.createCompatible).not.toHaveBeenCalled();
    expect(mocks.responses).toHaveBeenCalledOnce();
  });
  it('honors the disabled switch even with an OpenRouter key', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter');
    vi.stubEnv('XAI_DISABLED', 'true');
    await expect(
      generateFreshGameQuestions({ game: 'ladder', topic: 'ثقافة عامة' }),
    ).rejects.toMatchObject({ code: 'CONFIG' });
    expect(mocks.generateText).not.toHaveBeenCalled();
  });
  it('uses the configured gateway without an xAI key', async () => {
    vi.stubEnv('XAI_API_KEY', '');
    vi.stubEnv('AI_GATEWAY_API_KEY', 'gateway-test');
    vi.stubEnv('AI_QUESTIONS_MODEL', 'xai/test-model');
    const questions = Array.from({ length: 15 }, (_, index) => question(index + 1));
    mocks.generateText.mockResolvedValue({ output: { questions } });
    expect(await generateFreshGameQuestions({ game: 'millionaire', topic: 'ثقافة عامة' })).toEqual(
      questions,
    );
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'xai/test-model' }),
    );
    expect(mocks.responses).not.toHaveBeenCalled();
  });
  it('falls back to direct xAI when gateway generation fails', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'gateway-test');
    const questions = Array.from({ length: 15 }, (_, index) => question(index + 1));
    mocks.generateText
      .mockRejectedValueOnce(new Error('gateway unavailable'))
      .mockResolvedValueOnce({ output: { questions } });
    expect(await generateFreshGameQuestions({ game: 'millionaire', topic: 'ثقافة عامة' })).toEqual(
      questions,
    );
    expect(mocks.responses).toHaveBeenCalledOnce();
  });
  it('rejects repeated questions, old prompts, incomplete levels, and mismatched answers', () => {
    const input = { game: 'millionaire' as const, topic: 'ثقافة عامة', excludePrompts: [] };
    const questions = Array.from({ length: 15 }, (_, index) => question(index + 1));
    expect(() => validateGameQuestionBatch(input, questions.slice(1))).toThrow();
    expect(() =>
      validateGameQuestionBatch(input, [questions[0]!, ...questions.slice(0, 14)]),
    ).toThrow();
    expect(() =>
      validateGameQuestionBatch({ ...input, excludePrompts: [questions[0]!.prompt] }, questions),
    ).toThrow();
    expect(() =>
      validateGameQuestionBatch(
        input,
        questions.map((item) => ({ ...item, slot: 1 })),
      ),
    ).toThrow();
    expect(() =>
      validateGameQuestionBatch(
        input,
        questions.map((item) => ({ ...item, answerIndex: 2 })),
      ),
    ).toThrow();
  });
  it('requires two valid alternatives for every board letter', () => {
    const questions = LETTER_QUESTION_POOL.map((item, index) => ({
      ...question((index % 25) + 1),
      prompt: item.prompt,
      answer: item.answer,
      letter: item.letter,
      options: [],
    }));
    const input = { game: 'letter-challenge' as const, topic: 'ثقافة عامة', excludePrompts: [] };
    expect(
      validateGameQuestionBatch(input, generatedGameQuestionsSchema.parse({ questions }).questions),
    ).toHaveLength(50);
    expect(() =>
      validateGameQuestionBatch(
        input,
        questions.map((item, index) => (index === 0 ? { ...item, letter: 'ب' } : item)),
      ),
    ).toThrow();
  });
});

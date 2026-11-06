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
describe('fresh game question generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('XAI_API_KEY', 'test-only');
    vi.stubEnv('XAI_DISABLED', 'false');
    vi.stubEnv('AI_GATEWAY_API_KEY', '');
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('AI_QUESTIONS_MODEL', '');
    vi.stubEnv('AI_GATEWAY_MODEL', '');
    vi.stubEnv('OPENROUTER_API_KEY', '');
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
  it('generates a validated ladder with the free OpenRouter model', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    vi.stubEnv('XAI_API_KEY', '');
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter');
    const questions = Array.from({ length: 24 }, (_, index) => question(index + 1));
    mocks.generateText.mockResolvedValue({ output: { questions } });
    expect(await generateFreshGameQuestions({ game: 'ladder', topic: 'ثقافة عامة' })).toEqual(
      questions,
    );
    expect(mocks.createCompatible).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'openrouter',
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPENROUTER_API_KEY,
        supportsStructuredOutputs: true,
      }),
    );
    expect(mocks.openrouterModel).toHaveBeenCalledWith('openrouter/free');
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        maxOutputTokens: 8192,
        providerOptions: { openrouter: { reasoning: { enabled: false } } },
      }),
    );
    expect(mocks.responses).not.toHaveBeenCalled();
    expect(timeout).toHaveBeenCalledWith(80_000);
    timeout.mockRestore();
  });
  it('does not fall back to a paid provider when free OpenRouter fails', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter');
    vi.stubEnv('AI_GATEWAY_API_KEY', 'gateway-test');
    mocks.generateText.mockRejectedValue(new Error('upstream unavailable'));
    await expect(
      generateFreshGameQuestions({ game: 'ladder', topic: 'ثقافة عامة' }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
    expect(mocks.responses).not.toHaveBeenCalled();
  });
  it('logs only a safe provider error class and HTTP status', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = Object.assign(new Error('private provider response'), {
      name: 'AI_APICallError',
      statusCode: 429,
      responseBody: 'private provider response',
    });
    mocks.generateText.mockRejectedValue(error);
    await expect(
      generateFreshGameQuestions({ game: 'ladder', topic: 'private user topic' }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(log).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith('[game-questions-openrouter]', {
      stage: 'generation',
      errorClass: 'AI_APICallError',
      statusCode: 429,
    });
    log.mockRestore();
  });
  it('logs validation failure without recording generated question text', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.generateText.mockResolvedValue({ output: { questions: [question(1)] } });
    await expect(
      generateFreshGameQuestions({ game: 'ladder', topic: 'private user topic' }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(log).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith('[game-questions-openrouter]', {
      stage: 'validation',
      errorClass: 'ZodError',
      statusCode: null,
    });
    log.mockRestore();
  });
  it('does not log arbitrary error names or invalid status values', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = Object.assign(new Error('private data'), {
      name: 'private user content',
      statusCode: 'private response',
    });
    mocks.generateText.mockRejectedValue(error);
    await expect(
      generateFreshGameQuestions({ game: 'ladder', topic: 'private user topic' }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(log).toHaveBeenCalledWith('[game-questions-openrouter]', {
      stage: 'generation',
      errorClass: 'Unknown',
      statusCode: null,
    });
    log.mockRestore();
  });
  it('keeps other games on their existing provider when OpenRouter is configured', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter');
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

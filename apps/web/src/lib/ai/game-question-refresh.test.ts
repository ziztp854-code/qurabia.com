import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ generateText: vi.fn(), responses: vi.fn(() => ({})) }));
vi.mock('ai', () => ({
  generateText: mocks.generateText,
  Output: { object: (value: unknown) => value },
}));
vi.mock('@ai-sdk/xai', () => ({ xai: { responses: mocks.responses } }));
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

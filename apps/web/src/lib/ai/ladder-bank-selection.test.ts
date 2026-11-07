import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ load: vi.fn(), generate: vi.fn(), model: vi.fn(() => ({})) }));
vi.mock('@/lib/questions/feed', () => ({ loadBankTaggedQuestions: mocks.load }));
vi.mock('@ai-sdk/openai-compatible', () => ({ createOpenAICompatible: () => mocks.model }));
vi.mock('ai', () => ({
  generateText: mocks.generate,
  Output: { object: (value: unknown) => value },
}));
import { selectLadderBankQuestions } from './ladder-bank-selection';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
function bank() {
  return Array.from({ length: 30 }, (_, index) => ({
    id: `bank-${index}`,
    prompt: `سؤال ثقافي مختلف رقم ${index}؟`,
    categoryName: 'ثقافة',
    difficulty: 'MEDIUM',
    timeLimit: 20,
    explanation: 'شرح الإجابة الصحيحة',
    options: ['الأول', 'الثاني', 'الثالث', 'الرابع'].map((text, position) => ({
      text,
      isCorrect: position === 1,
    })),
  }));
}
it('selects only original bank questions, preserving their answers', async () => {
  vi.stubEnv('KIMI_API_KEY', 'test');
  vi.stubEnv('XAI_DISABLED', 'false');
  mocks.load.mockResolvedValue({ rows: bank() });
  mocks.generate.mockResolvedValue({
    output: { indices: Array.from({ length: 24 }, (_, i) => i) },
    finishReason: 'stop',
  });
  const selected = await selectLadderBankQuestions({ topic: 'ثقافة عامة', excludePrompts: [] });
  expect(selected).toHaveLength(24);
  expect(selected[0]).toMatchObject({
    id: 'bank-0',
    question: { answer: 'الثاني', answerIndex: 1, prompt: bank()[0]!.prompt },
  });
  expect(mocks.load).toHaveBeenCalledWith(
    'LADDER',
    expect.objectContaining({ types: ['MULTIPLE_CHOICE'] }),
  );
  const prompt = mocks.generate.mock.calls[0]![0].prompt;
  expect(prompt).not.toContain('الثاني');
});
it.each([Array(24).fill(0), [...Array.from({ length: 23 }, (_, i) => i), 999]])(
  'rejects repeated or unknown selections',
  async (indices) => {
    vi.stubEnv('KIMI_API_KEY', 'test');
    vi.stubEnv('XAI_DISABLED', 'false');
    mocks.load.mockResolvedValue({ rows: bank() });
    mocks.generate.mockResolvedValue({ output: { indices }, finishReason: 'stop' });
    await expect(
      selectLadderBankQuestions({ topic: 'ثقافة عامة', excludePrompts: [] }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  },
);
it('fails without calling Kimi when not enough distinct questions remain', async () => {
  vi.stubEnv('KIMI_API_KEY', 'test');
  vi.stubEnv('XAI_DISABLED', 'false');
  mocks.load.mockResolvedValue({ rows: bank().slice(0, 23) });
  await expect(
    selectLadderBankQuestions({ topic: 'ثقافة عامة', excludePrompts: [] }),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  expect(mocks.generate).not.toHaveBeenCalled();
});

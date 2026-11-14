import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ load: vi.fn(), generate: vi.fn(), model: vi.fn(() => ({})) }));
vi.mock('@/lib/questions/feed', () => ({
  loadBankTaggedQuestionPages: mocks.load,
}));
vi.mock('@ai-sdk/openai-compatible', () => ({ createOpenAICompatible: () => mocks.model }));
vi.mock('ai', () => ({
  generateText: mocks.generate,
  Output: { object: (value: unknown) => value },
}));
import { selectLadderBankQuestions } from './ladder-bank-selection';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});
function bank() {
  return Array.from({ length: 30 }, (_, index) => ({
    id: `bank-${index}`,
    prompt: `سؤال ثقافي مختلف رقم ${index}؟`,
    categoryName: 'ثقافة',
    difficulty: index < 10 ? 'EASY' : index < 20 ? 'MEDIUM' : 'HARD',
    timeLimit: 20,
    explanation: 'شرح الإجابة الصحيحة',
    options: ['الأول', 'الثاني', 'الثالث', 'الرابع'].map((text, position) => ({
      text,
      isCorrect: position === 1,
    })),
  }));
}
function setBankPages(...pages: ReturnType<typeof bank>[]) {
  mocks.load.mockImplementation(async function* () {
    yield* pages;
  });
}

it('selects only original bank questions, preserving their answers', async () => {
  vi.stubEnv('KIMI_API_KEY', 'test');
  vi.stubEnv('XAI_DISABLED', 'false');
  setBankPages(bank());
  mocks.generate.mockResolvedValue({
    output: { indices: [0, 1, 2, 10, 11, 12, 20, 21, 22, 23] },
    finishReason: 'stop',
  });
  const selected = await selectLadderBankQuestions({ excludePrompts: [] });
  expect(selected).toHaveLength(10);
  expect(selected[0]).toMatchObject({
    id: 'bank-0',
    question: { answer: 'الثاني', answerIndex: 1, prompt: bank()[0]!.prompt },
  });
  expect(mocks.load).toHaveBeenCalledWith(
    'LADDER',
    expect.objectContaining({ types: ['MULTIPLE_CHOICE'] }),
  );
  const prompt = mocks.generate.mock.calls[0]![0].prompt;
  expect(prompt).not.toContain('isCorrect');
  expect(selected.map((item) => item.question.difficulty)).toEqual([
    'EASY',
    'EASY',
    'EASY',
    'MEDIUM',
    'MEDIUM',
    'MEDIUM',
    'HARD',
    'HARD',
    'HARD',
    'HARD',
  ]);
});
it.each([
  Array(10).fill(0),
  [0, 1, 2, 10, 11, 12, 20, 21, 22, 999],
  [0, 1, 2, 3, 10, 11, 20, 21, 22, 23],
])('rejects repeated or unknown selections', async (indices) => {
  vi.stubEnv('KIMI_API_KEY', 'test');
  vi.stubEnv('XAI_DISABLED', 'false');
  setBankPages(bank());
  mocks.generate.mockResolvedValue({ output: { indices }, finishReason: 'stop' });
  await expect(selectLadderBankQuestions({ excludePrompts: [] })).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
});
it('fails without calling Kimi when not enough distinct questions remain', async () => {
  vi.stubEnv('KIMI_API_KEY', 'test');
  vi.stubEnv('XAI_DISABLED', 'false');
  setBankPages(bank().slice(0, 22));
  await expect(selectLadderBankQuestions({ excludePrompts: [] })).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
  expect(mocks.generate).not.toHaveBeenCalled();
});

it('falls back to ten original bank questions for a completed empty selection', async () => {
  vi.stubEnv('KIMI_API_KEY', 'test');
  vi.stubEnv('XAI_DISABLED', 'false');
  const rows = bank();
  const original =
    'من هو القائد القرطاجي الشهير الذي قاد جيشه مع الفيلة وعبر جبال الألب لمهاجمة روما؟';
  rows[20]!.prompt = original;
  rows[21]!.prompt = `${original} (فصل 93)`;
  rows[22]!.prompt = `${original} (فصل ٨)`;
  rows[23]!.prompt = 'ما عنوان الفصل الوارد في هذه الرواية؟ (فصل 9)';
  setBankPages(rows);
  mocks.generate.mockResolvedValue({ output: { indices: [] }, finishReason: 'stop' });

  const selected = await selectLadderBankQuestions({
    excludePrompts: [rows[0]!.prompt],
  });
  expect(selected.map(({ id }) => id)).toEqual([
    'bank-1',
    'bank-2',
    'bank-3',
    'bank-10',
    'bank-11',
    'bank-12',
    'bank-20',
    'bank-23',
    'bank-24',
    'bank-25',
  ]);
  expect(selected[6]?.question).toMatchObject({ prompt: original, answerIndex: 1 });
  expect(mocks.generate.mock.calls[0]![0].prompt).not.toContain('(فصل 93)');
  expect(mocks.generate.mock.calls[0]![0].prompt).not.toContain('(فصل ٨)');
});

it('does not fall back when an empty response was truncated', async () => {
  vi.stubEnv('KIMI_API_KEY', 'test');
  vi.stubEnv('XAI_DISABLED', 'false');
  setBankPages(bank());
  mocks.generate.mockResolvedValue({ output: { indices: [] }, finishReason: 'length' });
  await expect(selectLadderBankQuestions({ excludePrompts: [] })).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
});

it('samples a later page from the whole bank and diversifies a local fallback', async () => {
  vi.stubEnv('KIMI_API_KEY', 'test');
  vi.stubEnv('XAI_DISABLED', 'false');
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const early = Array.from({ length: 1500 }, (_, index) => ({
    ...bank()[0]!,
    id: `early-${index}`,
    prompt: `سؤال صالح مختلف رقم ${index}؟`,
    categoryName: 'تاريخ',
    difficulty: index < 500 ? 'EASY' : index < 1000 ? 'MEDIUM' : 'HARD',
  }));
  const later = {
    ...early[0]!,
    id: 'late-science',
    prompt: 'ما المصطلح العلمي الذي يصف انتقال الإلكترونات؟',
    categoryName: 'علوم',
  };
  setBankPages(early.slice(0, 500), early.slice(500, 1000), early.slice(1000), [later]);
  mocks.generate.mockResolvedValue({ output: { indices: [] }, finishReason: 'stop' });

  const selected = await selectLadderBankQuestions({ excludePrompts: [] });
  expect(selected.map(({ id }) => id)).toContain('late-science');
  expect(new Set(selected.map(({ question }) => question.category))).toEqual(
    new Set(['تاريخ', 'علوم']),
  );
  expect(mocks.generate.mock.calls[0]![0].prompt).toContain(later.prompt);
});

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { isKnownLadderQuestionDuplicate } from '@tahaddi/domain';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { loadBankTaggedQuestionPages } from '@/lib/questions/feed';
import { foldKeyword } from '@/lib/questions/keywords';
import { GameContentGenerationError } from './game-content-generation';
import {
  generatedGameQuestionSchema,
  type GeneratedGameQuestion,
} from './game-question-refresh-contract';

export async function selectLadderBankQuestions(input: { excludePrompts: string[] }) {
  const apiKey = process.env.KIMI_API_KEY?.trim();
  if (!apiKey || process.env.XAI_DISABLED === 'true')
    throw new GameContentGenerationError('خدمة اختيار أسئلة السلم غير مهيأة حاليًا.', 'CONFIG');
  const seen = new Set(input.excludePrompts.map(foldKeyword));
  const required = { EASY: 3, MEDIUM: 3, HARD: 4 } as const;
  const difficulties = ['EASY', 'MEDIUM', 'HARD'] as const;
  type Candidate = { id: string; question: GeneratedGameQuestion };
  const pool: Record<(typeof difficulties)[number], Candidate[]> = {
    EASY: [],
    MEDIUM: [],
    HARD: [],
  };
  const eligibleCount = { EASY: 0, MEDIUM: 0, HARD: 0 };
  const perDifficulty = 40;
  for await (const rows of loadBankTaggedQuestionPages('LADDER', { types: ['MULTIPLE_CHOICE'] })) {
    for (const row of rows) {
      if (isKnownLadderQuestionDuplicate(row.prompt)) continue;
      const key = foldKeyword(row.prompt);
      if (seen.has(key)) continue;
      const answerIndex = row.options.findIndex((option) => option.isCorrect);
      const question = {
        prompt: row.prompt,
        answer: row.options[answerIndex]?.text ?? '',
        options: row.options.map((option) => option.text),
        answerIndex,
        category: row.categoryName,
        explanation: row.explanation?.trim() || 'الإجابة الصحيحة موضحة في الخيارات.',
        letter: '',
        slot: 1,
        difficulty: row.difficulty,
      };
      if (
        !Number.isFinite(row.timeLimit) ||
        row.timeLimit <= 0 ||
        /^سؤال\s+الجولة(?:\s|$)|^سؤال\s+\d+\s+من\s+\d+$/u.test(row.prompt.trim()) ||
        row.options.some((option) => /^إجابة\s+[أ-ي]$/u.test(option.text.trim())) ||
        row.options.length !== 4 ||
        row.options.filter((option) => option.isCorrect).length !== 1 ||
        new Set(row.options.map((option) => foldKeyword(option.text))).size !== 4 ||
        !generatedGameQuestionSchema.safeParse(question).success
      )
        continue;
      seen.add(key);
      const candidates = pool[row.difficulty];
      const count = ++eligibleCount[row.difficulty];
      // Each valid question across all pages has the same chance at its difficulty.
      // Bound the number of rows sent to the model, not the source bank.
      const slot =
        candidates.length < perDifficulty ? candidates.length : Math.floor(Math.random() * count);
      if (slot < perDifficulty) candidates[slot] = { id: row.id, question };
    }
  }
  const candidates = difficulties.flatMap((difficulty) => pool[difficulty]);
  if (difficulties.some((difficulty) => pool[difficulty].length < required[difficulty]))
    throw new GameContentGenerationError(
      'لا توجد أسئلة كافية صالحة في بنك السلم لهذا الطلب.',
      'INVALID_RESPONSE',
    );
  const kimi = createOpenAICompatible({
    name: 'kimi',
    baseURL: 'https://api.moonshot.ai/v1',
    apiKey,
    supportsStructuredOutputs: false,
  });
  try {
    const result = await generateText({
      model: kimi('kimi-k3.1-pro'),
      output: Output.object({
        schema: z.object({ indices: z.array(z.number().int()).max(10) }).strict(),
      }),
      prompt: [
        'اختر عشرة أسئلة قوية ومختلفة من جميع التصنيفات المتاحة دون حصرها في موضوع محدد: ثلاثة EASY وثلاثة MEDIUM وأربعة HARD حسب الصعوبة المسجلة. نوّع التصنيفات قدر الإمكان، وفضّل الأسئلة الواضحة والدقيقة ذات الخيارات المتمايزة والحقائق المستقرة. لا تؤلف أو تغيّر الأسئلة. إذا تعذر الاختيار فأرجع مصفوفة فارغة.',
        'أرجع JSON فقط بالشكل {"indices": [أرقام الأسئلة]}، باستخدام الأرقام الموجودة فقط دون تكرار.',
        JSON.stringify(
          candidates.map((item, index) => ({
            index,
            prompt: item.question.prompt,
            category: item.question.category,
            difficulty: item.question.difficulty,
            options: item.question.options,
          })),
        ),
      ].join('\n'),
      maxOutputTokens: 4096,
      maxRetries: 0,
      providerOptions: { kimi: { reasoningEffort: 'low' } },
      abortSignal: AbortSignal.timeout(80_000),
    });
    const modelIndices = result.output.indices;
    // The request always spans all categories. Prefer underrepresented categories in the
    // fallback while keeping the same difficulty distribution and downstream validation.
    const indices =
      modelIndices.length === 0 && result.finishReason === 'stop'
        ? balancedBankIndices(candidates, required)
        : modelIndices;
    if (indices.length === 0)
      throw new GameContentGenerationError(
        'لا توجد أسئلة كافية صالحة في بنك السلم لهذا الطلب.',
        'INVALID_RESPONSE',
      );
    if (
      indices.length !== 10 ||
      result.finishReason === 'length' ||
      new Set(indices).size !== 10 ||
      indices.some((index) => index < 0 || index >= candidates.length)
    )
      throw new Error('Invalid bank selection');
    const selected = indices.map((index) => candidates[index]!);
    if (
      difficulties.some(
        (difficulty) =>
          selected.filter((item) => item.question.difficulty === difficulty).length !==
          required[difficulty],
      )
    )
      throw new Error('Invalid difficulty distribution');
    selected.sort(
      (a, b) =>
        difficulties.indexOf(a.question.difficulty) - difficulties.indexOf(b.question.difficulty),
    );
    return selected.map((item, slot) => ({
      id: item.id,
      question: { ...item.question, slot: slot + 1 } as GeneratedGameQuestion,
    }));
  } catch (error) {
    if (error instanceof GameContentGenerationError) throw error;
    throw new GameContentGenerationError(
      'تعذّر اختيار أسئلة صالحة من البنك. حاول مرة أخرى.',
      'INVALID_RESPONSE',
    );
  }
}

function balancedBankIndices(
  candidates: Array<{ question: Pick<GeneratedGameQuestion, 'difficulty' | 'category'> }>,
  required: Record<'EASY' | 'MEDIUM' | 'HARD', number>,
): number[] {
  const counts = new Map<string, number>();
  const chosen: number[] = [];
  for (const difficulty of ['EASY', 'MEDIUM', 'HARD'] as const) {
    let pool = candidates.flatMap(({ question }, index) =>
      question.difficulty === difficulty ? [{ index, category: question.category }] : [],
    );
    for (let i = 0; i < required[difficulty]; i++) {
      pool.sort((a, b) => (counts.get(a.category) ?? 0) - (counts.get(b.category) ?? 0));
      const [next, ...rest] = pool;
      if (!next) break;
      chosen.push(next.index);
      counts.set(next.category, (counts.get(next.category) ?? 0) + 1);
      pool = rest;
    }
  }
  return chosen;
}

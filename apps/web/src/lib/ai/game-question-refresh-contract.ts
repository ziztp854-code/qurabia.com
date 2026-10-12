import { z } from 'zod';

export const AI_QUESTION_GAMES = [
  'letter-challenge',
  'category-board',
  'millionaire',
  'knowledge-tower',
  'quote-master',
  'ladder',
  'elimination-live',
  'word-code',
  'question-word',
] as const;
export type AiQuestionGame = (typeof AI_QUESTION_GAMES)[number];
export const AI_QUESTION_COUNTS: Record<AiQuestionGame, number> = {
  'letter-challenge': 50,
  'category-board': 18,
  millionaire: 15,
  'knowledge-tower': 12,
  'quote-master': 12,
  ladder: 24,
  'elimination-live': 24,
  'word-code': 12,
  'question-word': 12,
};
export const gameQuestionRefreshInputSchema = z
  .object({
    game: z.enum(AI_QUESTION_GAMES),
    topic: z.string().trim().min(3, 'اكتب موضوعًا من ثلاثة أحرف على الأقل.').max(120),
    excludePrompts: z.array(z.string().trim().max(1000)).max(80).default([]),
  })
  .strict();

export const generatedGameQuestionSchema = z
  .object({
    prompt: z.string().trim().min(8).max(240),
    answer: z.string().trim().min(1).max(120),
    options: z.array(z.string().trim().min(1).max(120)).max(4),
    answerIndex: z.number().int().min(0).max(3),
    category: z.string().trim().min(1).max(80),
    explanation: z.string().trim().min(5).max(300),
    letter: z.string().max(1),
    slot: z.number().int().min(1).max(25),
    difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  })
  .strict();
export const generatedGameQuestionsSchema = z
  .object({
    questions: z.array(generatedGameQuestionSchema).min(12).max(50),
  })
  .strict();
export type GeneratedGameQuestion = z.infer<typeof generatedGameQuestionSchema>;

export function toGameQuestionFeed(questions: readonly GeneratedGameQuestion[], batchId: string) {
  return questions.map((question, index) => ({
    id: `${batchId}-${index}`,
    prompt: question.prompt,
    type: question.options.length ? ('MULTIPLE_CHOICE' as const) : ('SHORT_ANSWER' as const),
    expectedAnswer: question.answer,
    difficulty: question.difficulty,
    categoryId: null,
    categoryName: question.category,
    timeLimit: 20,
    basePoints: question.slot * 200,
    keywords: question.letter
      ? [`حرف:${question.letter}`]
      : [`مستوى:${question.slot}`, `قيمة:${question.slot * 200}`],
    explanation: question.explanation,
    position: index,
    options: question.options.map((text, position) => ({
      id: `${batchId}-${index}-${position}`,
      text,
      position,
      isCorrect: position === question.answerIndex,
    })),
  }));
}

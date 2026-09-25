import { beforeEach, describe, expect, it, vi } from 'vitest';
import { selectCategoryAndDifficultyBalancedQuestions } from '../questions/random-selection';
import { generateOpenClawStructured } from './openclaw-client';
import { selectOpenClawQuizQuestionIds } from './quiz-question-selector';

vi.mock('./openclaw-client', () => ({ generateOpenClawStructured: vi.fn() }));

const model = vi.mocked(generateOpenClawStructured);
const counts = { EASY: 2, MEDIUM: 2, HARD: 2 } as const;
const candidates = (['EASY', 'MEDIUM', 'HARD'] as const).flatMap((difficulty) =>
  ['A', 'B', 'C'].map((categoryId) => ({
    id: `${difficulty}-${categoryId}`,
    prompt: `السؤال ${difficulty} ${categoryId}`,
    categoryId,
    difficulty,
  })),
);

function fallback(excluded: string[] = []) {
  return selectCategoryAndDifficultyBalancedQuestions(candidates, counts, 'seed', excluded);
}

describe('OpenClaw quiz selection', () => {
  beforeEach(() => model.mockReset());

  it('accepts a balanced model selection from published candidate metadata only', async () => {
    const ids = ['EASY-A', 'MEDIUM-B', 'HARD-C', 'EASY-B', 'MEDIUM-C', 'HARD-A'];
    model.mockResolvedValue({ ids });
    const input = candidates.map((candidate) => ({ ...candidate, answer: 'should-remain-private' }));

    await expect(selectOpenClawQuizQuestionIds(input, counts, 'seed')).resolves.toEqual({
      ids,
      source: 'openclaw',
    });
    const options = model.mock.calls[0]![1];
    expect(options.timeoutMs).toBeLessThanOrEqual(10_000);
    expect(options.prompt).toContain('EASY-A');
    expect(options.systemPrompt).toContain('غير موثوقة');
    expect(options.prompt).not.toContain('should-remain-private');
  });

  it.each([
    ['unknown question', ['EASY-A', 'MEDIUM-B', 'HARD-C', 'EASY-B', 'MEDIUM-C', 'unknown']],
    ['duplicate question', ['EASY-A', 'MEDIUM-B', 'HARD-C', 'EASY-B', 'MEDIUM-C', 'EASY-A']],
    ['wrong difficulty quotas', ['EASY-A', 'EASY-B', 'EASY-C', 'MEDIUM-A', 'MEDIUM-B', 'HARD-A']],
    ['concentrated categories', ['EASY-A', 'EASY-B', 'MEDIUM-A', 'MEDIUM-B', 'HARD-A', 'HARD-B']],
  ])('uses the balanced fallback for %s', async (_case, ids) => {
    model.mockResolvedValue({ ids });
    await expect(selectOpenClawQuizQuestionIds(candidates, counts, 'seed')).resolves.toEqual({
      ids: fallback(),
      source: 'fallback',
    });
  });

  it('uses the balanced fallback when OpenClaw returns no usable response', async () => {
    model.mockResolvedValue(undefined as never);
    const result = await selectOpenClawQuizQuestionIds(candidates, counts, 'seed');
    expect(result).toEqual({
      ids: fallback(),
      source: 'fallback',
    });
  });

  it('never sends or selects an excluded question or equivalent prompt', async () => {
    const input = [
      ...candidates,
      { id: 'EASY-duplicate', prompt: candidates[0]!.prompt, categoryId: 'D', difficulty: 'EASY' as const },
    ];
    model.mockResolvedValue({ ids: ['EASY-duplicate', 'EASY-B', 'MEDIUM-A', 'MEDIUM-B', 'HARD-A', 'HARD-B'] });
    const result = await selectOpenClawQuizQuestionIds(input, counts, 'seed', ['EASY-A']);

    expect(result.source).toBe('fallback');
    expect(result.ids).toEqual(selectCategoryAndDifficultyBalancedQuestions(input, counts, 'seed', ['EASY-A']));
    expect(result.ids).not.toContain('EASY-A');
    expect(result.ids).not.toContain('EASY-duplicate');
    expect(model.mock.calls[0]![1].prompt).not.toContain('EASY-duplicate');
  });

  it('does not call OpenClaw when the bank cannot satisfy the requested quotas', async () => {
    const result = await selectOpenClawQuizQuestionIds(candidates, { EASY: 5, MEDIUM: 2, HARD: 2 }, 'seed');
    expect(result.source).toBe('fallback');
    expect(model).not.toHaveBeenCalled();
  });
});

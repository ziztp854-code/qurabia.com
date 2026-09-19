import { describe, expect, it } from 'vitest';
import { CATEGORY_BOARD_LIBRARY } from './category-board-data';

describe('Category board question library', () => {
  it('offers twelve balanced categories with unique questions', () => {
    expect(CATEGORY_BOARD_LIBRARY).toHaveLength(12);
    expect(CATEGORY_BOARD_LIBRARY.flatMap((category) => category.questions)).toHaveLength(72);

    const questionIds = CATEGORY_BOARD_LIBRARY.flatMap((category) =>
      category.questions.map((question) => question.id),
    );
    const prompts = CATEGORY_BOARD_LIBRARY.flatMap((category) =>
      category.questions.map((question) => question.prompt),
    );

    expect(new Set(questionIds).size).toBe(questionIds.length);
    expect(new Set(prompts).size).toBe(prompts.length);

    for (const category of CATEGORY_BOARD_LIBRARY) {
      expect(category.questions).toHaveLength(6);
      expect(category.questions.filter((question) => question.value === 200)).toHaveLength(2);
      expect(category.questions.filter((question) => question.value === 400)).toHaveLength(2);
      expect(category.questions.filter((question) => question.value === 600)).toHaveLength(2);
    }
  });
});

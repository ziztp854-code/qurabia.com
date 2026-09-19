import { describe, expect, it } from 'vitest';
import { areQuizQuestionsPlayable, canManageContentResource } from './content-policy';

describe('content resource management policy', () => {
  it.each(['OWNER', 'ADMIN'])('allows %s to manage questions', (role) => {
    expect(canManageContentResource(role, 'Question')).toBe(true);
  });

  it.each(['CONTENT_EDITOR', 'MODERATOR', 'USER', undefined])(
    'blocks %s from managing questions',
    (role) => {
      expect(canManageContentResource(role, 'Question')).toBe(false);
    },
  );

  it('keeps existing content permissions for quizzes', () => {
    expect(canManageContentResource('CONTENT_EDITOR', 'Quiz')).toBe(true);
  });

  it('rejects unknown resource types', () => {
    expect(canManageContentResource('OWNER', 'Unknown')).toBe(false);
  });
});

describe('quiz publishing policy', () => {
  it('accepts only complete published questions', () => {
    expect(
      areQuizQuestionsPlayable([
        { status: 'PUBLISHED', optionCount: 4, correctOptionCount: 1 },
        { status: 'PUBLISHED', optionCount: 2, correctOptionCount: 1 },
      ]),
    ).toBe(true);
  });

  it.each([
    [[]],
    [[{ status: 'DRAFT', optionCount: 4, correctOptionCount: 1 }]],
    [[{ status: 'ARCHIVED', optionCount: 4, correctOptionCount: 1 }]],
    [[{ status: 'PUBLISHED', optionCount: 1, correctOptionCount: 1 }]],
    [[{ status: 'PUBLISHED', optionCount: 4, correctOptionCount: 0 }]],
    [[{ status: 'PUBLISHED', optionCount: 4, correctOptionCount: 2 }]],
  ])('rejects incomplete question sets', (questions) => {
    expect(areQuizQuestionsPlayable(questions)).toBe(false);
  });
});

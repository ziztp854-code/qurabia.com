import { describe, expect, it } from 'vitest';
import {
  addQuestionToQuizDraft,
  createEmptyQuizDraft,
  parseQuizDraft,
  questionSupportsGameMode,
  QUIZ_DRAFT_STORAGE_KEY,
  writeQuizDraft,
} from './quiz-draft';

const sample = {
  id: 'q1',
  prompt: 'ما عاصمة السعودية؟',
  category: 'جغرافيا',
  duration: 20,
  points: 1000,
};

describe('quiz-draft', () => {
  it('rejects incompatible bank questions without changing the draft', () => {
    writeQuizDraft(createEmptyQuizDraft());
    expect(addQuestionToQuizDraft({ ...sample, gameTypes: ['LADDER'] })).toMatchObject({
      status: 'error',
    });
    expect(parseQuizDraft(localStorage.getItem(QUIZ_DRAFT_STORAGE_KEY)!)?.questions).toEqual([]);
    expect(addQuestionToQuizDraft({ ...sample, gameTypes: ['QUIZ'] })).toEqual({
      status: 'added',
      count: 1,
    });
  });
  it('parses a valid draft and defaults gameMode', () => {
    const draft = createEmptyQuizDraft();
    draft.questions.push(sample);
    const parsed = parseQuizDraft(JSON.stringify({ ...draft, version: 2, gameMode: undefined }));
    expect(parsed?.questions).toHaveLength(1);
    expect(parsed?.gameMode).toBe('QUIZ');
    expect(parsed?.version).toBe(5);
  });

  it('preserves an explicit gameMode in draft v3', () => {
    const draft = createEmptyQuizDraft();
    draft.gameMode = 'LADDER';
    expect(parseQuizDraft(JSON.stringify(draft))?.gameMode).toBe('LADDER');
  });

  it('adds a question once into localStorage draft', () => {
    localStorage.removeItem(QUIZ_DRAFT_STORAGE_KEY);
    writeQuizDraft(createEmptyQuizDraft());

    expect(addQuestionToQuizDraft(sample)).toEqual({ status: 'added', count: 1 });
    expect(addQuestionToQuizDraft(sample)).toEqual({ status: 'exists', count: 1 });
  });

  it('checks whether a bank question supports the selected game mode', () => {
    expect(questionSupportsGameMode({ gameTypes: ['LADDER', 'QUIZ'] }, 'LADDER')).toBe(true);
    expect(questionSupportsGameMode({ gameTypes: ['QUIZ'] }, 'MILLIONAIRE')).toBe(false);
    expect(questionSupportsGameMode({}, 'QUIZ')).toBe(true);
  });
});

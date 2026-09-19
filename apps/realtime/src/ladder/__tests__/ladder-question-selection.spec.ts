import {
  getLadderDifficulty,
  selectLadderQuestionCandidate,
  type LadderQuestionCandidate,
} from '../ladder-question-selection.js';

const candidate = (
  id: string,
  difficulty: LadderQuestionCandidate['difficulty'],
  categoryId: string,
): LadderQuestionCandidate => ({
  id,
  type: 'TRUE_FALSE',
  prompt: `السؤال ${id}`,
  difficulty,
  category: { id: categoryId, name: `التصنيف ${categoryId}` },
  timeLimit: 20,
  options: [
    { id: `${id}-a`, text: 'أ', isCorrect: true },
    { id: `${id}-b`, text: 'ب', isCorrect: false },
  ],
});

describe('Ladder question selection policy', () => {
  describe('difficulty progression', () => {
    it.each([
      [1, 'EASY'],
      [3, 'EASY'],
      [4, 'MEDIUM'],
      [7, 'MEDIUM'],
      [8, 'HARD'],
      [10, 'HARD'],
    ] as const)('maps round %s of 10 to %s', (round, expected) => {
      expect(getLadderDifficulty(round, 10)).toBe(expected);
    });

    it('uses 30% / 70% boundaries for variable round counts', () => {
      expect(getLadderDifficulty(6, 20)).toBe('EASY');
      expect(getLadderDifficulty(7, 20)).toBe('MEDIUM');
      expect(getLadderDifficulty(14, 20)).toBe('MEDIUM');
      expect(getLadderDifficulty(15, 20)).toBe('HARD');
    });
  });

  describe('fallback hierarchy and balancing', () => {
    it('rejects placeholder prompts and duplicate option text', () => {
      const placeholder = {
        ...candidate('placeholder', 'EASY', 'science'),
        prompt: 'سؤال الجولة 1 من 10',
      };
      const duplicateOptions = {
        ...candidate('duplicate', 'EASY', 'science'),
        options: [
          { id: 'duplicate-a', text: 'الرياض', isCorrect: true },
          { id: 'duplicate-b', text: ' الرياض ', isCorrect: false },
        ],
      };

      const result = selectLadderQuestionCandidate({
        candidates: [placeholder, duplicateOptions],
        targetDifficulty: 'EASY',
        usedQuestionIds: [],
        recentCategoryIds: [],
      });

      expect(result).toBeNull();
    });

    it('A: prefers the requested difficulty with a different category', () => {
      const result = selectLadderQuestionCandidate({
        candidates: [
          candidate('same-category', 'MEDIUM', 'history'),
          candidate('different-category', 'MEDIUM', 'science'),
        ],
        targetDifficulty: 'MEDIUM',
        usedQuestionIds: [],
        recentCategoryIds: ['history'],
        random: () => 0,
      });

      expect(result).toMatchObject({ tier: 'A' });
      expect(result?.candidate.id).toBe('different-category');
    });

    it('B: uses the same difficulty and category when no alternative category exists', () => {
      const result = selectLadderQuestionCandidate({
        candidates: [candidate('same-category', 'MEDIUM', 'history')],
        targetDifficulty: 'MEDIUM',
        usedQuestionIds: [],
        recentCategoryIds: ['history'],
        random: () => 0,
      });

      expect(result).toMatchObject({ tier: 'B' });
    });

    it('C: prefers an adjacent difficulty with a different category', () => {
      const result = selectLadderQuestionCandidate({
        candidates: [
          candidate('adjacent-same', 'EASY', 'history'),
          candidate('adjacent-different', 'HARD', 'science'),
        ],
        targetDifficulty: 'MEDIUM',
        usedQuestionIds: [],
        recentCategoryIds: ['history'],
        random: () => 0,
      });

      expect(result).toMatchObject({ tier: 'C' });
      expect(result?.candidate.id).toBe('adjacent-different');
    });

    it('D: uses an adjacent difficulty in the same category when necessary', () => {
      const result = selectLadderQuestionCandidate({
        candidates: [candidate('adjacent-same', 'HARD', 'history')],
        targetDifficulty: 'MEDIUM',
        usedQuestionIds: [],
        recentCategoryIds: ['history'],
        random: () => 0,
      });

      expect(result).toMatchObject({ tier: 'D' });
    });

    it('E: uses any valid unused question after the nearer tiers are exhausted', () => {
      const result = selectLadderQuestionCandidate({
        candidates: [candidate('distant', 'HARD', 'science')],
        targetDifficulty: 'EASY',
        usedQuestionIds: [],
        recentCategoryIds: ['history'],
        random: () => 0,
      });

      expect(result).toMatchObject({ tier: 'E' });
    });

    it('never repeats a used question and reports an exhausted pool', () => {
      const result = selectLadderQuestionCandidate({
        candidates: [candidate('used', 'EASY', 'science')],
        targetDifficulty: 'EASY',
        usedQuestionIds: ['used'],
        recentCategoryIds: [],
        random: () => 0,
      });

      expect(result).toBeNull();
    });

    it('does not repeat when the pool has fewer questions than rounds', () => {
      const candidates = [
        candidate('q1', 'EASY', 'science'),
        candidate('q2', 'MEDIUM', 'history'),
      ];
      const first = selectLadderQuestionCandidate({
        candidates,
        targetDifficulty: 'EASY',
        usedQuestionIds: [],
        recentCategoryIds: [],
        random: () => 0,
      });
      const second = selectLadderQuestionCandidate({
        candidates,
        targetDifficulty: 'MEDIUM',
        usedQuestionIds: [first!.candidate.id],
        recentCategoryIds: [first!.candidate.category.id],
        random: () => 0,
      });
      const third = selectLadderQuestionCandidate({
        candidates,
        targetDifficulty: 'HARD',
        usedQuestionIds: [first!.candidate.id, second!.candidate.id],
        recentCategoryIds: [second!.candidate.category.id],
        random: () => 0,
      });

      expect(second?.candidate.id).not.toBe(first?.candidate.id);
      expect(third).toBeNull();
    });

    it('picks randomly among equal tier matches to avoid repeating the same lead question', () => {
      const candidates = [
        candidate('a', 'EASY', 'science'),
        candidate('b', 'EASY', 'history'),
        candidate('c', 'EASY', 'culture'),
      ];

      const first = selectLadderQuestionCandidate({
        candidates,
        targetDifficulty: 'EASY',
        usedQuestionIds: [],
        recentCategoryIds: [],
        random: () => 0,
      });
      const second = selectLadderQuestionCandidate({
        candidates,
        targetDifficulty: 'EASY',
        usedQuestionIds: [],
        recentCategoryIds: [],
        random: () => 0.99,
      });

      expect(first?.tier).toBe('A');
      expect(second?.tier).toBe('A');
      expect(first?.candidate.id).toBe('a');
      expect(second?.candidate.id).toBe('c');
      expect(first?.candidate.id).not.toBe(second?.candidate.id);
    });
  });
});

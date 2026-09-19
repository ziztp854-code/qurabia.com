import {
  resolveInfiltratorRound,
  selectInfiltratorId,
} from './infiltrator.logic.js';

const players = ['p1', 'p2', 'p3', 'p4'].map((id) => ({ id }));

describe('infiltrator logic', () => {
  it('selects exactly one player using the supplied random source', () => {
    expect(selectInfiltratorId(players, () => 0)).toBe('p1');
    expect(selectInfiltratorId(players, () => 0.74)).toBe('p3');
    expect(selectInfiltratorId([], () => 0)).toBeNull();
  });

  it('rewards the majority when a unique vote catches the infiltrator', () => {
    const result = resolveInfiltratorRound({
      players,
      infiltratorId: 'p4',
      votes: { p1: 'p4', p2: 'p4', p3: 'p2', p4: 'p1' },
      majorityGuess: 'جدة',
      majorityQuestion: 'ما عاصمة المملكة العربية السعودية؟',
    });

    expect(result).toMatchObject({
      caught: true,
      survived: false,
      guessedMajority: false,
    });
    expect(result.scoreDeltas).toEqual({ p1: 10, p2: 10, p3: 0, p4: 0 });
  });

  it('lets the infiltrator win by surviving or guessing the majority answer', () => {
    const result = resolveInfiltratorRound({
      players,
      infiltratorId: 'p4',
      votes: { p1: 'p2', p2: 'p1', p3: 'p4', p4: 'p1' },
      majorityGuess: 'ما عاصمة المملكة العربية السعودية؟',
      majorityQuestion: 'ما عاصمة المملكة العربية السعودية؟',
    });

    expect(result).toMatchObject({
      caught: false,
      survived: true,
      guessedMajority: true,
      infiltratorWon: true,
    });
    expect(result.scoreDeltas.p4).toBe(30);
    expect(result.scoreDeltas.p3).toBe(10);
  });
});

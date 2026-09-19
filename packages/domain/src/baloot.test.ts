import { describe, expect, it } from 'vitest';
import {
  BALOOT_RULES,
  advanceContractMultiplier,
  applyRoundToMatch,
  convertRawCardPoints,
  createDeck,
  detectProjects,
  getLegalPlays,
  getKabootTeam,
  getMatchWinner,
  getProjectPoints,
  resolveTiedRoundWinner,
  scoreProjectDeclarations,
  scoreRound,
  selectTimeoutPlay,
  type Card,
  type ProjectDeclaration,
  type TrickResult,
} from './baloot';

const card = (suit: Card['suit'], rank: Card['rank']): Card => ({ suit, rank });

const hokum96To66 = (): TrickResult[] => {
  const team0 = [
      card('clubs', 'A'), card('diamonds', 'A'), card('hearts', 'A'), card('spades', 'A'),
      card('clubs', '10'), card('diamonds', '10'), card('hearts', '10'), card('spades', '10'),
      card('clubs', 'Q'), card('diamonds', 'Q'), card('hearts', 'Q'), card('spades', 'Q'),
      card('clubs', '7'), card('clubs', '8'), card('diamonds', '7'), card('diamonds', '8'),
  ];
  const team1 = [
      card('spades', 'J'), card('spades', '9'),
      card('clubs', 'K'), card('diamonds', 'K'), card('hearts', 'K'), card('spades', 'K'),
      card('clubs', 'J'), card('diamonds', 'J'), card('hearts', 'J'),
      card('hearts', '7'), card('hearts', '8'), card('spades', '7'), card('spades', '8'),
      card('clubs', '9'), card('diamonds', '9'), card('hearts', '9'),
  ];
  return [
    ...Array.from({ length: 4 }, (_, index) => ({
      winnerTeam: 0 as const,
      cards: team0.slice(index * 4, index * 4 + 4),
    })),
    ...Array.from({ length: 4 }, (_, index) => ({
      winnerTeam: 1 as const,
      cards: team1.slice(index * 4, index * 4 + 4),
    })),
  ];
};

const run = (length: 3 | 4 | 5, highRank: Card['rank'] = 'J') => {
  const highIndex = BALOOT_RULES.ranks.indexOf(highRank);
  return {
    kind: 'run' as const,
    cards: BALOOT_RULES.ranks
      .slice(highIndex - length + 1, highIndex + 1)
      .map((rank) => card('hearts', rank)),
  };
};

describe('Baloot scoring rules', () => {
  it('keeps every numeric rule in the exported rules object', () => {
    expect(BALOOT_RULES.matchTarget).toBe(152);
    expect(BALOOT_RULES.rawRoundPoints).toEqual({ hokum: 162, sun: 130 });
    expect(BALOOT_RULES.gameRoundPoints).toEqual({ hokum: 16, sun: 26 });
    expect(BALOOT_RULES.lastTrickRawPoints).toBe(10);
    expect(BALOOT_RULES.balootGamePoints).toBe(2);
    expect(BALOOT_RULES.turnTimeoutMs).toBe(60_000);
  });

  it('converts a 96/66 Hokum round to 10/6 game points', () => {
    expect(convertRawCardPoints('hokum', [96, 66], 0)).toEqual([10, 6]);
  });

  it('rounds units ending in five down in Hokum but preserves them in Sun', () => {
    expect(convertRawCardPoints('hokum', [65, 97], 0)).toEqual([6, 10]);
    expect(convertRawCardPoints('sun', [65, 65], 0)).toEqual([13, 13]);
  });

  it('scores projects directly in game points for both contracts', () => {
    expect(getProjectPoints(run(3), 'hokum')).toBe(2);
    expect(getProjectPoints(run(3), 'sun')).toBe(4);
    expect(getProjectPoints(run(5, 'A'), 'hokum')).toBe(10);
    expect(getProjectPoints(run(5, 'A'), 'sun')).toBe(20);
    expect(getProjectPoints({ kind: 'four-of-kind', rank: 'A', cards: [] }, 'hokum')).toBe(10);
    expect(getProjectPoints({ kind: 'four-of-kind', rank: 'A', cards: [] }, 'sun')).toBe(40);
    expect(getProjectPoints({ kind: 'four-of-kind', rank: '9', cards: [] }, 'hokum')).toBe(0);
  });

  it('awards every eligible project to the team with the best declaration', () => {
    const declarations: ProjectDeclaration[] = [
      { team: 0, declarationOrder: 1, project: run(4, '10') },
      { team: 0, declarationOrder: 1, project: run(3, '9') },
      { team: 1, declarationOrder: 0, project: run(4, 'J') },
    ];

    expect(scoreProjectDeclarations('hokum', declarations, [4, 4])).toEqual([0, 5]);
  });

  it('prefers four of a kind over a five-card run when their values tie', () => {
    const declarations: ProjectDeclaration[] = [
      { team: 0, declarationOrder: 0, project: run(5, 'A') },
      {
        team: 1,
        declarationOrder: 1,
        project: { kind: 'four-of-kind', rank: 'A', cards: [] },
      },
    ];

    expect(scoreProjectDeclarations('hokum', declarations, [4, 4])).toEqual([0, 10]);
  });

  it('drops projects declared by a team that won no tricks', () => {
    const declarations: ProjectDeclaration[] = [
      { team: 0, declarationOrder: 0, project: run(5, 'A') },
      { team: 1, declarationOrder: 1, project: run(3, '9') },
    ];

    expect(scoreProjectDeclarations('hokum', declarations, [0, 8])).toEqual([0, 2]);
  });

  it('detects projects without leaking French raw point values', () => {
    const [project] = detectProjects([
      card('hearts', '7'), card('hearts', '8'), card('hearts', '9'), card('hearts', '10'),
    ]);

    expect(project).toEqual({
      kind: 'run',
      cards: [card('hearts', '7'), card('hearts', '8'), card('hearts', '9'), card('hearts', '10')],
    });
    expect(project).not.toHaveProperty('points');
  });

  it('requires an overtrump when cutting and a higher trump is available', () => {
    const hand = [card('spades', 'A'), card('spades', 'J'), card('clubs', '7')];
    const trick = [card('hearts', 'A'), card('spades', '9')];

    expect(getLegalPlays(hand, trick, { mode: 'hokum', trump: 'spades' })).toEqual([
      card('spades', 'J'),
    ]);
  });

  it('chooses the lowest legal card deterministically on timeout', () => {
    const choice = selectTimeoutPlay(
      [card('hearts', '10'), card('hearts', '7'), card('spades', 'J')],
      [card('hearts', 'A')],
      { mode: 'hokum', trump: 'spades' },
    );

    expect(choice).toEqual({
      card: card('hearts', '7'),
      event: { type: 'AUTO_PLAY', reason: 'TURN_TIMEOUT', card: card('hearts', '7') },
    });
  });

  it('scores a close undoubled buyer win using converted game points', () => {
    const result = scoreRound({
      contract: { mode: 'hokum', trump: 'spades' },
      tricks: hokum96To66(),
      buyerPlayerId: 0,
      countingTeam: 0,
    });

    expect(result.applied).toEqual([10, 6]);
  });

  it('gives the full round and all declarations to the opponent when the buyer loses', () => {
    const result = scoreRound({
      contract: { mode: 'hokum', trump: 'spades' },
      tricks: hokum96To66(),
      buyerPlayerId: 1,
      countingTeam: 0,
      projects: [{ team: 0, declarationOrder: 0, project: run(3, '9') }],
      balootTeams: [1],
    });

    expect(result.applied).toEqual([20, 0]);
  });

  it('doubles cards and projects but never doubles Baloot', () => {
    const result = scoreRound({
      contract: { mode: 'hokum', trump: 'spades' },
      tricks: hokum96To66(),
      buyerPlayerId: 0,
      countingTeam: 0,
      multiplier: 2,
      projects: [{ team: 0, declarationOrder: 0, project: run(3, '9') }],
      balootTeams: [0],
    });

    expect(result.applied).toEqual([38, 0]);
  });

  it('scores a doubled Hokum kaboot as 50 before winner projects and Baloot', () => {
    const deck = createDeck();
    const result = scoreRound({
      contract: { mode: 'hokum', trump: 'spades' },
      tricks: Array.from({ length: 8 }, (_, index) => ({
        winnerTeam: 0 as const,
        cards: deck.slice(index * 4, index * 4 + 4),
      })),
      buyerPlayerId: 0,
      countingTeam: 0,
      multiplier: 2,
      projects: [{ team: 0, declarationOrder: 0, project: run(3, '9') }],
      balootTeams: [0],
    });

    expect(result.applied).toEqual([56, 0]);
    expect(result.teams[0].cardPoints).toBe(25);
  });

  it('implements the multiplier ladder and Sun restriction', () => {
    expect(advanceContractMultiplier({ contract: { mode: 'hokum', trump: 'spades' }, current: 1 })).toBe(2);
    expect(advanceContractMultiplier({ contract: { mode: 'hokum', trump: 'spades' }, current: 2 })).toBe(3);
    expect(advanceContractMultiplier({ contract: { mode: 'hokum', trump: 'spades' }, current: 3 })).toBe(4);
    expect(advanceContractMultiplier({ contract: { mode: 'hokum', trump: 'spades' }, current: 4 })).toBe('gahwa');
    expect(advanceContractMultiplier({ contract: { mode: 'sun' }, current: 1, matchScores: [101, 99] })).toBe(2);
    expect(() => advanceContractMultiplier({ contract: { mode: 'sun' }, current: 1, matchScores: [100, 99] })).toThrow();
    expect(() => advanceContractMultiplier({ contract: { mode: 'sun' }, current: 2, matchScores: [101, 99] })).toThrow();
  });

  it('breaks converted score ties using the counting-team units digit', () => {
    expect(resolveTiedRoundWinner('hokum', [77, 85], 0, 0)).toBe(1);
    expect(resolveTiedRoundWinner('hokum', [91, 71], 0, 1)).toBe(1);
    expect(resolveTiedRoundWinner('sun', [61, 69], 0, 1)).toBe(0);
    expect(resolveTiedRoundWinner('sun', [65, 65], 0, 1)).toBe(1);
  });

  it('identifies kaboot only when one team wins all eight tricks', () => {
    expect(getKabootTeam([8, 0])).toBe(0);
    expect(getKabootTeam([0, 8])).toBe(1);
    expect(getKabootTeam([7, 1])).toBeNull();
  });

  it('aggregates a round and applies the 152-point match rule', () => {
    expect(applyRoundToMatch([145, 140], { applied: [8, 6] })).toEqual({
      scores: [153, 146],
      winnerTeam: 0,
    });
    expect(applyRoundToMatch([144, 146], { applied: [8, 6] })).toEqual({
      scores: [152, 152],
      winnerTeam: null,
    });
  });

  it('does not declare a match winner while the scores are tied', () => {
    expect(getMatchWinner([152, 152])).toBeNull();
    expect(getMatchWinner([152, 151])).toBe(0);
    expect(getMatchWinner([152, 160])).toBe(1);
  });
});

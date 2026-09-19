import {
  RANK_POINTS,
  RANK_STRENGTH,
  createDeck,
  detectProjects,
  getLegalPlays,
  getTrickWinner,
  hasBaloot,
  scoreRound,
  shuffleDeck,
  type Card,
} from '../../../../../packages/domain/src/index.js';

const card = (suit: Card['suit'], rank: Card['rank']): Card => ({ suit, rank });

describe('baloot domain', () => {
  it('creates the 32 unique Baloot cards', () => {
    const deck = createDeck();

    expect(deck).toHaveLength(32);
    expect(new Set(deck.map(({ suit, rank }) => `${suit}:${rank}`)).size).toBe(
      32,
    );
  });

  it('shuffles immutably with an injectable RNG', () => {
    const deck = createDeck();
    const shuffled = shuffleDeck(deck, () => 0);

    expect(shuffled).not.toBe(deck);
    expect(deck).toEqual(createDeck());
    expect(shuffled).toEqual([
      deck[1],
      deck[2],
      deck[3],
      deck[4],
      deck[5],
      deck[6],
      deck[7],
      deck[8],
      deck[9],
      deck[10],
      deck[11],
      deck[12],
      deck[13],
      deck[14],
      deck[15],
      deck[16],
      deck[17],
      deck[18],
      deck[19],
      deck[20],
      deck[21],
      deck[22],
      deck[23],
      deck[24],
      deck[25],
      deck[26],
      deck[27],
      deck[28],
      deck[29],
      deck[30],
      deck[31],
      deck[0],
    ]);
  });

  it('uses Sun and Hokum rank strength and points', () => {
    expect(RANK_STRENGTH.sun).toEqual([
      '7',
      '8',
      '9',
      'J',
      'Q',
      'K',
      '10',
      'A',
    ]);
    expect(RANK_STRENGTH.hokum).toEqual([
      '7',
      '8',
      'Q',
      'K',
      '10',
      'A',
      '9',
      'J',
    ]);
    expect(RANK_POINTS.sun.A).toBe(11);
    expect(RANK_POINTS.sun.J).toBe(2);
    expect(RANK_POINTS.hokum.J).toBe(20);
    expect(RANK_POINTS.hokum['9']).toBe(14);
  });

  it('requires following suit when possible', () => {
    const hand = [card('hearts', '7'), card('clubs', 'A'), card('spades', 'J')];

    expect(getLegalPlays(hand, [card('hearts', 'A')], { mode: 'sun' })).toEqual(
      [card('hearts', '7')],
    );
  });

  it('requires trump when void in the led suit under Hokum', () => {
    const hand = [card('clubs', 'A'), card('spades', 'J'), card('spades', '7')];

    expect(
      getLegalPlays(hand, [card('hearts', 'A')], {
        mode: 'hokum',
        trump: 'spades',
      }),
    ).toEqual([card('spades', 'J'), card('spades', '7')]);
  });

  it('returns a new hand unchanged when neither led suit nor trump is held', () => {
    const hand = [card('clubs', 'A'), card('diamonds', '7')];
    const legal = getLegalPlays(hand, [card('hearts', 'A')], {
      mode: 'hokum',
      trump: 'spades',
    });

    expect(legal).toEqual(hand);
    expect(legal).not.toBe(hand);
  });

  it('selects the strongest led card in Sun', () => {
    const trick = [
      card('hearts', 'K'),
      card('hearts', '10'),
      card('clubs', 'A'),
      card('hearts', 'A'),
    ];

    expect(getTrickWinner(trick, { mode: 'sun' })).toBe(3);
  });

  it('lets trump win and applies Hokum strength', () => {
    const trick = [
      card('hearts', 'A'),
      card('spades', 'A'),
      card('spades', '9'),
      card('spades', 'J'),
    ];

    expect(getTrickWinner(trick, { mode: 'hokum', trump: 'spades' })).toBe(3);
  });

  it('detects runs and four-of-a-kind projects', () => {
    const projects = detectProjects([
      card('hearts', '7'),
      card('hearts', '8'),
      card('hearts', '9'),
      card('hearts', '10'),
      card('clubs', 'J'),
      card('diamonds', 'J'),
      card('hearts', 'J'),
      card('spades', 'J'),
    ]);

    const run = projects.find((project) => project.kind === 'run');
    expect(run).toMatchObject({ kind: 'run' });
    expect(run).not.toHaveProperty('points');
    expect(Array.isArray(run?.cards)).toBe(true);

    const fourOfKind = projects.find(
      (project) => project.kind === 'four-of-kind',
    );
    expect(fourOfKind).toMatchObject({
      kind: 'four-of-kind',
      rank: 'J',
    });
    expect(fourOfKind).not.toHaveProperty('points');
    expect(Array.isArray(fourOfKind?.cards)).toBe(true);
  });

  it('detects Baloot only for the trump king and queen', () => {
    expect(
      hasBaloot([card('spades', 'K'), card('spades', 'Q')], 'spades'),
    ).toBe(true);
    expect(
      hasBaloot([card('hearts', 'K'), card('hearts', 'Q')], 'spades'),
    ).toBe(false);
  });

  it('scores card points, projects, Baloot, and the last trick by team', () => {
    const deck = createDeck();
    const result = scoreRound({
      contract: { mode: 'hokum', trump: 'spades' },
      tricks: Array.from({ length: 8 }, (_, index) => ({
        winnerTeam: index < 4 ? 0 : 1,
        cards: deck.slice(index * 4, index * 4 + 4),
      })),
      projects: [
        {
          team: 0,
          declarationOrder: 0,
          project: {
            kind: 'run',
            cards: [
              card('hearts', '7'),
              card('hearts', '8'),
              card('hearts', '9'),
            ],
          },
        },
        {
          team: 1,
          declarationOrder: 1,
          project: { kind: 'four-of-kind', rank: 'A', cards: [] },
        },
      ],
      balootTeams: [0],
      buyerPlayerId: 0,
      countingTeam: 0,
    });

    expect(result).toEqual({
      teams: [
        {
          rawCardPoints: 60,
          cardPoints: 6,
          projectPoints: 0,
          balootPoints: 2,
          lastTrickPoints: 0,
          total: 8,
        },
        {
          rawCardPoints: 102,
          cardPoints: 10,
          projectPoints: 10,
          balootPoints: 0,
          lastTrickPoints: 10,
          total: 20,
        },
      ],
      total: 28,
      multiplier: 1,
      applied: [0, 28],
      winnerTeam: 1,
      kaboot: false,
    });
  });
});

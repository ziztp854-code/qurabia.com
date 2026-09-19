export const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'] as const;
export const RANKS = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;

export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];
export type Card = Readonly<{ suit: Suit; rank: Rank }>;
export type Contract = Readonly<{ mode: 'sun' }> | Readonly<{ mode: 'hokum'; trump: Suit }>;
export type AuctionRound = 1 | 2;
export type ContractMultiplier = 1 | 2 | 3 | 4;
export type MultiplierState = ContractMultiplier | 'gahwa';
export type Team = 0 | 1;
export type RandomSource = () => number;

export const BALOOT_RULES = {
  suits: SUITS,
  ranks: RANKS,
  matchTarget: 152,
  lastTrickRawPoints: 10,
  rawRoundPoints: { hokum: 162, sun: 130 },
  gameRoundPoints: { hokum: 16, sun: 26 },
  balootGamePoints: 2,
  rankStrength: {
    sun: ['7', '8', '9', 'J', 'Q', 'K', '10', 'A'],
    hokum: ['7', '8', 'Q', 'K', '10', 'A', '9', 'J'],
  },
  cardRawPoints: {
    sun: { '7': 0, '8': 0, '9': 0, J: 2, Q: 3, K: 4, '10': 10, A: 11 },
    hokum: { '7': 0, '8': 0, '9': 14, J: 20, Q: 3, K: 4, '10': 10, A: 11 },
  },
  projectGamePoints: {
    run: {
      hokum: { 3: 2, 4: 5, 5: 10 },
      sun: { 3: 4, 4: 10, 5: 20 },
    },
    fourOfKind: {
      hokum: { '7': 0, '8': 0, '9': 0, '10': 10, J: 10, Q: 10, K: 10, A: 10 },
      sun: { '7': 0, '8': 0, '9': 0, '10': 20, J: 20, Q: 20, K: 20, A: 40 },
    },
  },
  multipliers: [1, 2, 3, 4] as const,
  projectMultiplier: 2,
  kabootGamePoints: { hokum: 25, sun: 44 },
  sunDoubleScores: { above: 100, below: 100 },
  turnTimeoutMs: 60_000,
} as const;

export const RANK_STRENGTH: Readonly<Record<Contract['mode'], readonly Rank[]>> =
  BALOOT_RULES.rankStrength;
export const RANK_POINTS: Readonly<Record<Contract['mode'], Readonly<Record<Rank, number>>>> =
  BALOOT_RULES.cardRawPoints;

export type TeamBaseScore = Readonly<{
  rawCardPoints: number;
  cardPoints: number;
  projectPoints: number;
  balootPoints: number;
  lastTrickPoints: number;
  total: number;
}>;

export type TeamScore = TeamBaseScore;

export type RoundScore = Readonly<{
  teams: readonly [TeamScore, TeamScore];
  total: number;
  multiplier: ContractMultiplier;
  applied: readonly [number, number];
  winnerTeam: Team;
  kaboot: boolean;
}>;

export type RunProject = Readonly<{
  kind: 'run';
  cards: readonly Card[];
}>;

export type FourOfKindProject = Readonly<{
  kind: 'four-of-kind';
  rank: Rank;
  cards: readonly Card[];
}>;

export type Project = RunProject | FourOfKindProject;

export type ProjectDeclaration = Readonly<{
  team: Team;
  project: Project;
  declarationOrder: number;
}>;

export type TrickResult = Readonly<{
  winnerTeam: Team;
  cards: readonly Card[];
}>;

export type TimeoutPlay = Readonly<{
  card: Card;
  event: Readonly<{
    type: 'AUTO_PLAY';
    reason: 'TURN_TIMEOUT';
    card: Card;
  }>;
}>;

export const createDeck = (): Card[] =>
  SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank })));

const secureRandom = (): number => {
  const value = new Uint32Array(1);
  globalThis.crypto.getRandomValues(value);
  return value[0]! / 0x1_0000_0000;
};

export const shuffleDeck = (deck: readonly Card[], random: RandomSource = secureRandom): Card[] => {
  const shuffled = deck.map((entry) => ({ ...entry }));

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const sample = random();
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
      throw new RangeError('RNG must return a finite number in [0, 1)');
    }
    const swapIndex = Math.floor(sample * (index + 1));
    const current = shuffled[index]!;
    shuffled[index] = shuffled[swapIndex]!;
    shuffled[swapIndex] = current;
  }

  return shuffled;
};

const strength = (card: Card, contract: Contract): number => {
  const mode = contract.mode === 'hokum' && card.suit === contract.trump ? 'hokum' : 'sun';
  return RANK_STRENGTH[mode].indexOf(card.rank);
};

export const getLegalPlays = (
  hand: readonly Card[],
  trick: readonly Card[],
  contract: Contract,
): Card[] => {
  if (trick.length === 0) return hand.map((entry) => ({ ...entry }));

  const ledSuit = trick[0]!.suit;
  const following = hand.filter(({ suit }) => suit === ledSuit);
  if (following.length > 0) return following.map((entry) => ({ ...entry }));

  if (contract.mode === 'hokum') {
    const trumps = hand.filter(({ suit }) => suit === contract.trump);
    if (trumps.length > 0) {
      const winningTrump = trick
        .filter(({ suit }) => suit === contract.trump)
        .sort((left, right) => strength(right, contract) - strength(left, contract))[0];
      if (winningTrump) {
        const overtrumps = trumps.filter(
          (candidate) => strength(candidate, contract) > strength(winningTrump, contract),
        );
        if (overtrumps.length > 0) return overtrumps.map((entry) => ({ ...entry }));
      }
      return trumps.map((entry) => ({ ...entry }));
    }
  }

  return hand.map((entry) => ({ ...entry }));
};

export const getTrickWinner = (trick: readonly Card[], contract: Contract): number => {
  if (trick.length === 0) throw new RangeError('A trick must contain at least one card');

  const ledSuit = trick[0]!.suit;
  const winningSuit =
    contract.mode === 'hokum' && trick.some(({ suit }) => suit === contract.trump)
      ? contract.trump
      : ledSuit;

  return trick.reduce(
    (winner, candidate, index) =>
      candidate.suit === winningSuit &&
      strength(candidate, contract) > strength(trick[winner]!, contract)
        ? index
        : winner,
    trick.findIndex(({ suit }) => suit === winningSuit),
  );
};

export const detectProjects = (hand: readonly Card[]): Project[] => {
  const runs = SUITS.flatMap((suit): RunProject[] => {
    const suited = hand
      .filter((entry) => entry.suit === suit)
      .sort((left, right) => RANKS.indexOf(left.rank) - RANKS.indexOf(right.rank));
    const groups: Card[][] = [];

    for (const current of suited) {
      const previous = groups.at(-1)?.at(-1);
      if (previous && RANKS.indexOf(current.rank) === RANKS.indexOf(previous.rank) + 1) {
        groups[groups.length - 1] = [...groups[groups.length - 1]!, current];
      } else {
        groups.push([current]);
      }
    }

    return groups
      .filter((cards) => cards.length >= 3)
      .map((cards) => ({ kind: 'run', cards: cards.map((entry) => ({ ...entry })) }));
  });

  const fourOfKinds = RANKS.flatMap((rank): FourOfKindProject[] => {
    const cards = hand.filter((entry) => entry.rank === rank);
    if (cards.length !== 4 || rank === '7' || rank === '8' || rank === '9') return [];
    return [{ kind: 'four-of-kind', rank, cards: cards.map((entry) => ({ ...entry })) }];
  });

  return [...runs, ...fourOfKinds];
};

export const hasBaloot = (hand: readonly Card[], trump: Suit): boolean =>
  hand.some(({ suit, rank }) => suit === trump && rank === 'K') &&
  hand.some(({ suit, rank }) => suit === trump && rank === 'Q');

export const getProjectPoints = (project: Project, mode: Contract['mode']): number => {
  if (project.kind === 'four-of-kind') {
    return BALOOT_RULES.projectGamePoints.fourOfKind[mode][project.rank];
  }
  const length = Math.min(project.cards.length, 5) as 3 | 4 | 5;
  return project.cards.length < 3 ? 0 : BALOOT_RULES.projectGamePoints.run[mode][length];
};

const projectHighRank = (project: Project): number =>
  project.kind === 'four-of-kind'
    ? RANKS.indexOf(project.rank)
    : Math.max(...project.cards.map(({ rank }) => RANKS.indexOf(rank)));

const compareDeclarations = (
  mode: Contract['mode'],
  left: ProjectDeclaration,
  right: ProjectDeclaration,
): number => {
  const points = getProjectPoints(left.project, mode) - getProjectPoints(right.project, mode);
  if (points !== 0) return points;
  if (left.project.kind !== right.project.kind) {
    return left.project.kind === 'four-of-kind' ? 1 : -1;
  }
  const highRank = projectHighRank(left.project) - projectHighRank(right.project);
  if (highRank !== 0) return highRank;
  return right.declarationOrder - left.declarationOrder;
};

const cardKey = ({ suit, rank }: Card): string => `${suit}:${rank}`;

const sumNonOverlappingProjects = (
  mode: Contract['mode'],
  declarations: readonly ProjectDeclaration[],
): number => {
  const used = new Set<string>();
  return [...declarations]
    .sort((left, right) => compareDeclarations(mode, right, left))
    .reduce((sum, declaration) => {
      const keys = declaration.project.cards.map(cardKey);
      if (keys.some((key) => used.has(key))) return sum;
      keys.forEach((key) => used.add(key));
      return sum + getProjectPoints(declaration.project, mode);
    }, 0);
};

export const scoreProjectDeclarations = (
  mode: Contract['mode'],
  declarations: readonly ProjectDeclaration[],
  trickCounts: readonly [number, number],
): readonly [number, number] => {
  const eligible = declarations.filter(({ team }) => trickCounts[team] > 0);
  if (eligible.length === 0) return [0, 0];
  const best = eligible.reduce((winner, current) =>
    compareDeclarations(mode, current, winner) > 0 ? current : winner,
  );
  const winnerDeclarations = eligible.filter(({ team }) => team === best.team);
  const score = sumNonOverlappingProjects(mode, winnerDeclarations);
  return best.team === 0 ? [score, 0] : [0, score];
};

const cardRawPoints = (card: Card, contract: Contract): number => {
  const mode = contract.mode === 'hokum' && card.suit === contract.trump ? 'hokum' : 'sun';
  return RANK_POINTS[mode][card.rank];
};

const convertCountingTeamPoints = (mode: Contract['mode'], rawPoints: number): number => {
  const units = rawPoints % 10;
  if (mode === 'sun' && units === 5) return rawPoints / 5;
  const rounded = units === 5 ? rawPoints - 5 : Math.round(rawPoints / 10) * 10;
  return rounded / (mode === 'sun' ? 5 : 10);
};

export const convertRawCardPoints = (
  mode: Contract['mode'],
  rawPoints: readonly [number, number],
  countingTeam: Team,
): readonly [number, number] => {
  if (rawPoints[0] + rawPoints[1] !== BALOOT_RULES.rawRoundPoints[mode]) {
    throw new RangeError(`Card points must total ${BALOOT_RULES.rawRoundPoints[mode]}`);
  }
  const countingPoints = convertCountingTeamPoints(mode, rawPoints[countingTeam]);
  const otherPoints = BALOOT_RULES.gameRoundPoints[mode] - countingPoints;
  return countingTeam === 0 ? [countingPoints, otherPoints] : [otherPoints, countingPoints];
};

export const resolveTiedRoundWinner = (
  mode: Contract['mode'],
  rawPoints: readonly [number, number],
  countingTeam: Team,
  buyerTeam: Team,
): Team => {
  const units = rawPoints[countingTeam] % 10;
  if (mode === 'hokum') {
    if ([2, 3, 4, 5].includes(units)) return countingTeam;
    if (units === 1) return buyerTeam;
    return countingTeam === 0 ? 1 : 0;
  }
  if ([1, 2, 3, 4].includes(units)) return countingTeam;
  if (units === 0 || units === 5) return buyerTeam;
  return countingTeam === 0 ? 1 : 0;
};

export const selectTimeoutPlay = (
  hand: readonly Card[],
  trick: readonly Card[],
  contract: Contract,
): TimeoutPlay => {
  const legal = getLegalPlays(hand, trick, contract);
  if (legal.length === 0) throw new RangeError('Cannot auto-play from an empty hand');
  const selected = [...legal].sort((left, right) => {
    const points = cardRawPoints(left, contract) - cardRawPoints(right, contract);
    if (points !== 0) return points;
    const rank = strength(left, contract) - strength(right, contract);
    if (rank !== 0) return rank;
    return SUITS.indexOf(left.suit) - SUITS.indexOf(right.suit);
  })[0]!;
  const card = { ...selected };
  return { card, event: { type: 'AUTO_PLAY', reason: 'TURN_TIMEOUT', card } };
};

export const advanceContractMultiplier = (
  input: Readonly<{
    contract: Contract;
    current: ContractMultiplier;
    matchScores?: readonly [number, number];
  }>,
): MultiplierState => {
  if (input.contract.mode === 'sun') {
    const scores = input.matchScores;
    const canDouble =
      input.current === 1 &&
      scores !== undefined &&
      ((scores[0] > BALOOT_RULES.sunDoubleScores.above &&
        scores[1] < BALOOT_RULES.sunDoubleScores.below) ||
        (scores[1] > BALOOT_RULES.sunDoubleScores.above &&
          scores[0] < BALOOT_RULES.sunDoubleScores.below));
    if (!canDouble) throw new RangeError('Sun can only be doubled across the 100-point threshold');
    return 2;
  }
  const index = BALOOT_RULES.multipliers.indexOf(input.current);
  return input.current === 4 ? 'gahwa' : BALOOT_RULES.multipliers[index + 1]!;
};

export const getMatchWinner = (scores: readonly [number, number]): Team | null => {
  if (scores[0] === scores[1] || Math.max(...scores) < BALOOT_RULES.matchTarget) return null;
  return scores[0] > scores[1] ? 0 : 1;
};

export const applyRoundToMatch = (
  scores: readonly [number, number],
  round: Pick<RoundScore, 'applied'>,
): Readonly<{ scores: readonly [number, number]; winnerTeam: Team | null }> => {
  const updated = [scores[0] + round.applied[0], scores[1] + round.applied[1]] as const;
  return { scores: updated, winnerTeam: getMatchWinner(updated) };
};

export const getKabootTeam = (trickCounts: readonly [number, number]): Team | null =>
  trickCounts[0] === 8 ? 0 : trickCounts[1] === 8 ? 1 : null;

export const scoreRound = (
  input: Readonly<{
    contract: Contract;
    tricks: readonly TrickResult[];
    buyerPlayerId: number;
    countingTeam: Team;
    projects?: readonly ProjectDeclaration[];
    balootTeams?: readonly Team[];
    multiplier?: ContractMultiplier;
  }>,
): RoundScore => {
  if (!Number.isInteger(input.buyerPlayerId) || input.buyerPlayerId < 0 || input.buyerPlayerId > 3) {
    throw new RangeError('buyerPlayerId must identify one of the four players');
  }
  if (input.contract.mode === 'sun' && (input.balootTeams?.length ?? 0) > 0) {
    throw new RangeError('Baloot can only be declared in Hokum');
  }
  if (input.tricks.length !== 8) {
    throw new RangeError('A completed Baloot round must contain eight tricks');
  }

  const multiplier = input.multiplier ?? 1;
  const buyerTeam = (input.buyerPlayerId % 2) as Team;
  const trickCounts: [number, number] = [
    input.tricks.filter(({ winnerTeam }) => winnerTeam === 0).length,
    input.tricks.filter(({ winnerTeam }) => winnerTeam === 1).length,
  ];
  const rawCardPoints: [number, number] = [0, 0];
  input.tricks.forEach((trick) => {
    rawCardPoints[trick.winnerTeam] += trick.cards.reduce(
      (sum, card) => sum + cardRawPoints(card, input.contract),
      0,
    );
  });
  const lastTrickTeam = input.tricks.at(-1)?.winnerTeam;
  if (lastTrickTeam !== undefined) {
    rawCardPoints[lastTrickTeam] += BALOOT_RULES.lastTrickRawPoints;
  }
  const convertedCardPoints = convertRawCardPoints(
    input.contract.mode,
    rawCardPoints,
    input.countingTeam,
  );

  const kabootTeam = getKabootTeam(trickCounts);
  const cardPoints =
    kabootTeam === null
      ? convertedCardPoints
      : kabootTeam === 0
        ? ([BALOOT_RULES.kabootGamePoints[input.contract.mode], 0] as const)
        : ([0, BALOOT_RULES.kabootGamePoints[input.contract.mode]] as const);
  const projectPoints = scoreProjectDeclarations(
    input.contract.mode,
    input.projects ?? [],
    trickCounts,
  );
  const balootPoints: [number, number] = [
    input.balootTeams?.includes(0) ? BALOOT_RULES.balootGamePoints : 0,
    input.balootTeams?.includes(1) ? BALOOT_RULES.balootGamePoints : 0,
  ];
  const buildTeamScore = (team: Team): TeamScore => ({
    rawCardPoints: rawCardPoints[team],
    cardPoints: cardPoints[team],
    projectPoints: projectPoints[team],
    balootPoints: balootPoints[team],
    lastTrickPoints: lastTrickTeam === team ? BALOOT_RULES.lastTrickRawPoints : 0,
    total: cardPoints[team] + projectPoints[team] + balootPoints[team],
  });
  const teams = [buildTeamScore(0), buildTeamScore(1)] as const;

  const winnerTeam: Team =
    kabootTeam ??
    (teams[0].total === teams[1].total
      ? resolveTiedRoundWinner(input.contract.mode, rawCardPoints, input.countingTeam, buyerTeam)
      : teams[0].total > teams[1].total
        ? 0
        : 1);
  const totalProjects = projectPoints[0] + projectPoints[1];
  const totalBaloot = balootPoints[0] + balootPoints[1];
  let winnerScore: number;

  if (kabootTeam !== null) {
    winnerScore =
      BALOOT_RULES.kabootGamePoints[input.contract.mode] * multiplier +
      projectPoints[kabootTeam] * (multiplier === 1 ? 1 : BALOOT_RULES.projectMultiplier) +
      balootPoints[kabootTeam];
  } else if (multiplier > 1) {
    winnerScore =
      BALOOT_RULES.gameRoundPoints[input.contract.mode] * multiplier +
      totalProjects * BALOOT_RULES.projectMultiplier +
      totalBaloot;
  } else if (winnerTeam !== buyerTeam) {
    winnerScore = BALOOT_RULES.gameRoundPoints[input.contract.mode] + totalProjects + totalBaloot;
  } else {
    const applied = [teams[0].total, teams[1].total] as const;
    return {
      teams,
      total: applied[0] + applied[1],
      multiplier,
      applied,
      winnerTeam,
      kaboot: false,
    };
  }

  const applied = (winnerTeam === 0 ? [winnerScore, 0] : [0, winnerScore]) as readonly [
    number,
    number,
  ];
  return {
    teams,
    total: applied[0] + applied[1],
    multiplier,
    applied,
    winnerTeam,
    kaboot: kabootTeam !== null,
  };
};

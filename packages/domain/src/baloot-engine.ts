import {
  RANK_POINTS,
  detectProjects,
  getLegalPlays,
  getTrickWinner,
  type Card,
  type Contract,
  type Project,
  type Suit,
} from './baloot';

export const BALOOT_ENGINE_STATES = [
  'LOBBY_WAITING',
  'DEALING_PHASE_1',
  'BIDDING_PHASE',
  'DEALING_PHASE_2',
  'PROJECT_DECLARATION',
  'TRICK_PLAYING',
  'SCORING',
] as const;

export type BalootEngineState = (typeof BALOOT_ENGINE_STATES)[number];

export type BalootEngineEvent =
  | 'TABLE_FULL'
  | 'FIRST_DEAL_COMPLETE'
  | 'CONTRACT_LOCKED'
  | 'AUCTION_VOID'
  | 'SECOND_DEAL_COMPLETE'
  | 'PROJECTS_RESOLVED'
  | 'ROUND_COMPLETE'
  | 'MATCH_CONTINUES'
  | 'MATCH_OVER';

export type IllegalMoveResult = Readonly<{
  ok: false;
  code: 'ILLEGAL_MOVE';
}>;

export type LegalMoveResult = Readonly<{
  ok: true;
  card: Card;
}>;

export type MoveValidation = LegalMoveResult | IllegalMoveResult;

export type TrickPlay = Readonly<{
  seat: number;
  card: Card;
}>;

export type BotGameState = Readonly<{
  phase: BalootEngineState;
  currentTrick: readonly TrickPlay[];
  botSeat: number;
  contract: Contract | null;
  floorCard?: Card;
  auctionRound?: 1 | 2;
}>;

export type BotFallbackMove =
  | Readonly<{ kind: 'pass' }>
  | Readonly<{ kind: 'bid'; contract: Contract }>
  | Readonly<{ kind: 'declare'; projects: readonly Project[] }>
  | Readonly<{ kind: 'play'; card: Card }>;

const TRANSITIONS: Readonly<Record<BalootEngineState, Partial<Record<BalootEngineEvent, BalootEngineState>>>> =
  {
    LOBBY_WAITING: { TABLE_FULL: 'DEALING_PHASE_1' },
    DEALING_PHASE_1: { FIRST_DEAL_COMPLETE: 'BIDDING_PHASE' },
    BIDDING_PHASE: {
      CONTRACT_LOCKED: 'DEALING_PHASE_2',
      AUCTION_VOID: 'DEALING_PHASE_1',
    },
    DEALING_PHASE_2: { SECOND_DEAL_COMPLETE: 'PROJECT_DECLARATION' },
    PROJECT_DECLARATION: { PROJECTS_RESOLVED: 'TRICK_PLAYING' },
    TRICK_PLAYING: { ROUND_COMPLETE: 'SCORING' },
    SCORING: {
      MATCH_CONTINUES: 'DEALING_PHASE_1',
      MATCH_OVER: 'LOBBY_WAITING',
    },
  };

const HOKUM_BID_THRESHOLD = 20;
const SUN_BID_THRESHOLD = 22;

const sameCard = (left: Card, right: Card): boolean =>
  left.suit === right.suit && left.rank === right.rank;

const toContract = (gameType: Contract['mode'] | Contract, trumpSuit?: Suit): Contract => {
  if (typeof gameType === 'object') return gameType;
  if (gameType === 'sun') return { mode: 'sun' };
  if (!trumpSuit) throw new RangeError('Hokum validation requires trumpSuit');
  return { mode: 'hokum', trump: trumpSuit };
};

const cardPoints = (card: Card, contract: Contract): number => {
  const mode = contract.mode === 'hokum' && card.suit === contract.trump ? 'hokum' : 'sun';
  return RANK_POINTS[mode][card.rank];
};

const pickLowest = (cards: readonly Card[], contract: Contract): Card =>
  [...cards].sort((left, right) => {
    const points = cardPoints(left, contract) - cardPoints(right, contract);
    if (points !== 0) return points;
    if (left.suit !== right.suit) return left.suit.localeCompare(right.suit);
    return left.rank.localeCompare(right.rank);
  })[0]!;

const suitStrength = (hand: readonly Card[], suit: Suit, mode: Contract['mode']): number =>
  hand
    .filter((card) => card.suit === suit)
    .reduce((sum, card) => sum + RANK_POINTS[mode][card.rank], 0);

export class BalootStateMachine {
  constructor(private current: BalootEngineState = 'LOBBY_WAITING') {}

  get state(): BalootEngineState {
    return this.current;
  }

  canTransition(event: BalootEngineEvent): boolean {
    return Boolean(TRANSITIONS[this.current][event]);
  }

  transition(event: BalootEngineEvent): BalootEngineState {
    const next = TRANSITIONS[this.current][event];
    if (!next) {
      throw new RangeError(`Cannot apply ${event} from ${this.current}`);
    }
    this.current = next;
    return this.current;
  }
}

export function mapRuntimePhaseToEngineState(
  phase:
    | 'LOBBY'
    | 'READY'
    | 'DEALING'
    | 'BIDDING'
    | 'DOUBLING'
    | 'PLAYING'
    | 'TRICK_RESULT'
    | 'ROUND_RESULT'
    | 'GAME_OVER',
): BalootEngineState {
  switch (phase) {
    case 'LOBBY':
    case 'READY':
      return 'LOBBY_WAITING';
    case 'DEALING':
      return 'DEALING_PHASE_1';
    case 'BIDDING':
    case 'DOUBLING':
      return 'BIDDING_PHASE';
    case 'PLAYING':
    case 'TRICK_RESULT':
      return 'TRICK_PLAYING';
    case 'ROUND_RESULT':
    case 'GAME_OVER':
      return 'SCORING';
  }
}

export function validateCardMove(
  currentTrick: readonly Card[],
  playerHand: readonly Card[],
  cardToPlay: Card,
  gameType: Contract['mode'] | Contract,
  trumpSuit?: Suit,
): MoveValidation {
  const contract = toContract(gameType, trumpSuit);
  if (!playerHand.some((card) => sameCard(card, cardToPlay))) {
    return { ok: false, code: 'ILLEGAL_MOVE' };
  }
  const legal = getLegalPlays(playerHand, currentTrick, contract);
  if (!legal.some((card) => sameCard(card, cardToPlay))) {
    return { ok: false, code: 'ILLEGAL_MOVE' };
  }
  return { ok: true, card: { ...cardToPlay } };
}

export function executeBotFallbackMove(
  gameState: BotGameState,
  botPlayerHand: readonly Card[],
): BotFallbackMove {
  if (gameState.phase === 'BIDDING_PHASE') {
    return chooseBotBid(botPlayerHand, gameState.floorCard, gameState.auctionRound);
  }
  if (gameState.phase === 'PROJECT_DECLARATION') {
    return { kind: 'declare', projects: detectProjects(botPlayerHand) };
  }
  if (gameState.phase !== 'TRICK_PLAYING' || !gameState.contract) {
    throw new RangeError('Bot fallback requires a live trick contract');
  }
  return {
    kind: 'play',
    card: chooseBotCard(
      botPlayerHand,
      gameState.currentTrick,
      gameState.botSeat,
      gameState.contract,
    ),
  };
}

function chooseBotBid(
  hand: readonly Card[],
  floorCard: Card | undefined,
  auctionRound: 1 | 2 = 1,
): BotFallbackMove {
  const hokumSuits = (['clubs', 'diamonds', 'hearts', 'spades'] as const)
    .map((suit) => ({ suit, score: suitStrength(hand, suit, 'hokum') }))
    .sort((left, right) => right.score - left.score);
  const bestHokum = hokumSuits[0]!;
  const floorBoost =
    floorCard && bestHokum.suit === floorCard.suit
      ? RANK_POINTS.hokum[floorCard.rank]
      : 0;
  if (bestHokum.score + floorBoost >= HOKUM_BID_THRESHOLD) {
    return { kind: 'bid', contract: { mode: 'hokum', trump: bestHokum.suit } };
  }
  if (auctionRound === 2) return { kind: 'pass' };
  const sunScore = (['clubs', 'diamonds', 'hearts', 'spades'] as const).reduce(
    (sum, suit) => sum + suitStrength(hand, suit, 'sun'),
    0,
  );
  if (sunScore >= SUN_BID_THRESHOLD) {
    return { kind: 'bid', contract: { mode: 'sun' } };
  }
  return { kind: 'pass' };
}

function chooseBotCard(
  hand: readonly Card[],
  trick: readonly TrickPlay[],
  botSeat: number,
  contract: Contract,
): Card {
  const trickCards = trick.map((play) => play.card);
  const legal = getLegalPlays(hand, trickCards, contract);
  if (legal.length === 0) throw new RangeError('Cannot auto-play from an empty hand');
  if (trick.length === 0) return pickLowest(legal, contract);

  const winningIndex = getTrickWinner(trickCards, contract);
  const winningSeat = trick[winningIndex]!.seat;
  const partnerSeat = (botSeat + 2) % 4;
  if (winningSeat !== partnerSeat) return pickLowest(legal, contract);

  const safeGifts = legal.filter(
    (card) => getTrickWinner([...trickCards, card], contract) === winningIndex,
  );
  return pickLowest(safeGifts.length > 0 ? safeGifts : legal, contract);
}

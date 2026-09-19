export const BALOOT_PHASES = [
  'LOBBY',
  'READY',
  'DEALING',
  'BIDDING',
  'DOUBLING',
  'PLAYING',
  'TRICK_RESULT',
  'ROUND_RESULT',
  'GAME_OVER',
] as const;

export type BalootPhase = (typeof BALOOT_PHASES)[number];
export type BalootTeam = 'A' | 'B';
export type BalootSuit = 'clubs' | 'diamonds' | 'hearts' | 'spades';
export type BalootRank = '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

import type {
  AuctionRound,
  Contract,
  ContractMultiplier,
  ProjectDeclaration,
  RoundScore,
  Team,
} from '@tahaddi/domain';

/**
 * Every possible auction action. The engine is the sole authority that
 * decides which actions are legal in a given state — the client only
 * renders the buttons the server says are available.
 */
export type BalootBid =
  | { mode: 'pass' }
  | { mode: 'sun' }
  | { mode: 'hokum'; trump: BalootSuit }
  /**
   * "أشكل" — challenge the partner of the current declarer to take over
   * the contract. Only legal for the partner of the active bidder in
   * round 1, and only when there is an active contract to challenge.
   */
  | { mode: 'ashkal' }
  | { mode: 'accept' }
  | { mode: 'double'; play: 'open' | 'locked' }
  | { mode: 'triple' }
  | { mode: 'quadruple'; play: 'open' | 'locked' }
  | { mode: 'gahwa' };

export type BalootPlay = { seat: number; card: BalootCard };
export type BalootTrick = {
  winnerSeat: number;
  winnerTeam: BalootTeam;
  cards: BalootPlay[];
};

export type BalootAutoPlayEvent = {
  type: 'AUTO_PLAY';
  reason: 'TURN_TIMEOUT';
  seat: number;
  trickNumber: number;
  card: BalootCard;
};

/**
 * The contract that the table is currently playing under, with the
 * multiplier and the bidder's seat attached. `multiplier` is a
 * `ContractMultiplier` (1, 2, 3, or 4) and is mutated by the `DOUBLING`
 * phase before play starts. The `mode` field is the domain `Contract`
 * (e.g. `{ mode: 'sun' }` or `{ mode: 'hokum'; trump: ... }`).
 */
export type BalootContractState = {
  mode: Contract;
  multiplier: ContractMultiplier;
  buyerSeat: number;
  auctionRound: AuctionRound;
  /** When ashkal was used, the seat that originally declared before the challenge. */
  declaredBySeat: number;
};

export type BalootCard = {
  id: string;
  suit: BalootSuit;
  rank: BalootRank;
};

export type BalootSeat = {
  seat: number;
  team: BalootTeam;
  playerName: string;
  ready: boolean;
  connected: boolean;
  isHost: boolean;
};

type PrivateSeat = BalootSeat & {
  sessionToken: string;
  hand: BalootCard[];
};

/**
 * One historical bid in the auction log. Used to derive what the next
 * legal move is without leaking information to clients that shouldn't
 * see it (e.g. opponents' hands are still private).
 */
export type BalootBidEntry = {
  seat: number;
  bid: BalootBid;
  auctionRound: AuctionRound;
};

export type BalootRoom = {
  roomCode: string;
  phase: BalootPhase;
  stateVersion: number;
  seats: Array<PrivateSeat | null>;
  contract: BalootContractState | null;
  /**
   * Seat that has the next auction/doubling/play action. During the
   * DOUBLING phase, this seat must answer the pending double.
   */
  bidder: number;
  /** Seat that owns the contract for scoring purposes. */
  buyerPlayerId: number;
  /**
   * Number of consecutive passes seen in the current auction round.
   * When it reaches 4 the round closes.
   */
  passCount: number;
  /**
   * History of every bid in the current round, used by the engine to
   * decide when a second auction round (حكم ثاني) is needed and what
   * restrictions apply.
   */
  bidLog: BalootBidEntry[];
  /** Active auction round. 2 = "حكم ثاني" after a 4-pass first round. */
  auctionRound: AuctionRound;
  /**
   * Seat that has the next play action (during `PLAYING` only). During
   * `BIDDING` and `DOUBLING` the equivalent is `bidder`.
   */
  turn: number | null;
  currentTrick: BalootPlay[];
  trickHistory: BalootTrick[];
  scores: [number, number];
  /**
   * Highest contract offered so far in the current round. Drives the
   * "minimum bid" rule for the second round (حكم ثاني).
   */
  lastContract: BalootContractState | null;
  /**
   * Set to the team that has just doubled (or whose partner has just
   * re-doubled) during the DOUBLING phase, so the opposing team knows
   * who is expected to answer next. `null` when no double is pending.
   */
  pendingDouble: {
    fromSeat: number;
    announcement: 'double' | 'triple' | 'quadruple';
  } | null;
  /**
   * Seat that will lead the first trick once play starts. Usually the
   * buyer, but ashkal can move this to the partner.
   */
  leaderSeat: number;
  roundScore: RoundScore | null;
  /** Server-only declarations captured after the contract is fixed. */
  projectDeclarations: ProjectDeclaration[];
  /** Teams that held the trump K+Q when a Hokum round began. */
  balootTeams: Team[];
  autoPlayEvents: BalootAutoPlayEvent[];
  processedCommands: Set<string>;
  createdAt: number;
  expiresAt: number;
};

export type SerializedBalootRoom = Omit<BalootRoom, 'processedCommands'> & {
  processedCommands: string[];
};

export type BalootSnapshot = {
  roomCode: string;
  phase: BalootPhase;
  stateVersion: number;
  seats: BalootSeat[];
  yourSeat: number;
  yourTeam: BalootTeam;
  yourHand: BalootCard[];
  /**
   * Full contract state including buyer, multiplier and auction round.
   * `null` until the auction closes.
   */
  contract: BalootContractState | null;
  /** Last contract offered in the auction (null before the first bid). */
  lastContract: BalootContractState | null;
  /** Seat that owns the contract. */
  buyerPlayerId: number;
  /** Seat that will lead the first trick. */
  leaderSeat: number;
  /** Current auction round (1 or 2). */
  auctionRound: AuctionRound;
  /** Seat that has the next auction / doubling action. */
  bidder: number;
  /** Pending double waiting for an answer, or null. */
  pendingDouble: {
    fromSeat: number;
    announcement: 'double' | 'triple' | 'quadruple';
  } | null;
  turn: number | null;
  currentTrick: BalootPlay[];
  trickHistory: BalootTrick[];
  scores: [number, number];
  roundScore: RoundScore | null;
  autoPlayEvents: BalootAutoPlayEvent[];
  /**
   * The bid options the local player is allowed to take in the current
   * state. The server is the only authority that produces this list; the
   * client renders exactly these buttons and nothing else.
   */
  availableBids: BalootBid[];
};

export type BalootSuccess<T> = { ok: true; data: T };
export type BalootFailure = { ok: false; code: string; message: string };
export type BalootResult<T> = BalootSuccess<T> | BalootFailure;

export type BalootSession = {
  roomCode: string;
  sessionToken: string;
  snapshot: BalootSnapshot;
};

export type CreateBalootRoomPayload = { playerName?: string };
export type JoinBalootRoomPayload = {
  roomCode?: string;
  playerName?: string;
  sessionToken?: string;
};
export type ReadyBalootPayload = { ready?: boolean };
export type StartBalootPayload = Record<string, never>;
export type NextRoundBalootPayload = Record<string, never>;
export type LeaveBalootPayload = Record<string, never>;
export type ReconnectBalootPayload = { sessionToken?: string };
export type BalootCommand = { expectedVersion?: number; commandId?: string };
export type BidBalootPayload = BalootCommand & { bid?: BalootBid };
export type PlayBalootCardPayload = BalootCommand & {
  card?: Pick<BalootCard, 'suit' | 'rank'>;
};

export type BalootAcknowledgement = BalootResult<BalootSession>;
type BalootAck = (acknowledgement: BalootAcknowledgement) => void;
type BalootLeaveAck = (
  acknowledgement: BalootFailure | { ok: true; data: { left: true } },
) => void;

export type ClientToServerBalootEvents = {
  'baloot:host': (payload: CreateBalootRoomPayload, ack: BalootAck) => void;
  'baloot:join': (payload: JoinBalootRoomPayload, ack: BalootAck) => void;
  'baloot:ready': (payload: ReadyBalootPayload, ack: BalootAck) => void;
  'baloot:start': (payload: StartBalootPayload, ack: BalootAck) => void;
  'baloot:next-round': (
    payload: NextRoundBalootPayload,
    ack: BalootAck,
  ) => void;
  'baloot:leave': (payload: LeaveBalootPayload, ack: BalootLeaveAck) => void;
  'baloot:reconnect': (payload: ReconnectBalootPayload, ack: BalootAck) => void;
  'baloot:bid': (payload: BidBalootPayload, ack: BalootAck) => void;
  'baloot:play-card': (payload: PlayBalootCardPayload, ack: BalootAck) => void;
};

export type ServerToClientBalootEvents = {
  'baloot:state': (snapshot: BalootSnapshot) => void;
};

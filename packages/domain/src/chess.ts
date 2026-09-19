export type ChessColor = 'white' | 'black';
export type ChessRole = ChessColor | 'spectator';

export type ChessRoomPhase = 'waiting' | 'ready' | 'countdown' | 'playing' | 'finished';

export type ChessResultReason =
  | 'checkmate'
  | 'stalemate'
  | 'draw_repetition'
  | 'draw_fifty_move'
  | 'draw_insufficient_material'
  | 'draw_agreement'
  | 'resignation'
  | 'timeout'
  | 'disconnect_timeout'
  | 'aborted';

export type ChessPlayerSeat = {
  guestId: string;
  name: string;
  color: ChessColor;
  connected: boolean;
  disconnectAt?: number;
  createdAt?: number;
};

export type ChessTimeControl = {
  initialSeconds: number;
  incrementSeconds: number;
};

export type ChessClock = {
  remainingMs: number;
  startedAt?: number;
};

export type ChessMoveEntry = {
  san: string;
  from: string;
  to: string;
  promotion?: string;
  fen: string;
  timestamp: number;
  by: ChessColor;
};

export type ChessResult = {
  reason: ChessResultReason;
  winner: ChessColor | 'draw' | null;
  endedAt: number;
};

export type ChessRoom = {
  pin: string;
  hostGuestId: string;
  phase: ChessRoomPhase;
  fen: string;
  turn: ChessColor;
  stateVersion: number;
  moves: ChessMoveEntry[];
  timeControl: ChessTimeControl;
  whiteClock: ChessClock;
  blackClock: ChessClock;
  serverNow?: number;
  seats: {
    white: ChessPlayerSeat | null;
    black: ChessPlayerSeat | null;
  };
  spectators: Array<{
    guestId: string;
    name: string;
    joinedAt: number;
  }>;
  spectatorCount: number;
  lastMove: {
    from: string;
    to: string;
    san: string;
  } | null;
  result: ChessResult | null;
  drawOffer: {
    by: ChessColor;
    at: number;
  } | null;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
};

export type ChessRoomSnapshot = {
  pin: string;
  phase: ChessRoomPhase;
  fen: string;
  turn: ChessColor;
  stateVersion: number;
  moves: ChessMoveEntry[];
  timeControl: ChessTimeControl;
  whiteClock: ChessClock;
  blackClock: ChessClock;
  seats: {
    white: { name: string; connected: boolean } | null;
    black: { name: string; connected: boolean } | null;
  };
  spectatorCount: number;
  lastMove: ChessRoom['lastMove'];
  result: ChessRoom['result'];
  drawOffer: ChessRoom['drawOffer'] | null;
  isHost: boolean;
  yourColor: ChessColor | null;
  yourRole: ChessRole;
  yourGuestId?: string;
};

export type ChessGuestIdentity = {
  guestId: string;
  guestToken: string;
  pin?: string;
  color?: ChessColor;
  name?: string;
  createdAt: number;
  expiresAt: number;
};

export type TimeControlPreset = 'none' | '3+2' | '5+0' | '10+0' | '15+10';

export const CHESS_TIME_CONTROLS: Record<
  TimeControlPreset,
  { initialSeconds: number; incrementSeconds: number }
> = {
  none: { initialSeconds: 0, incrementSeconds: 0 },
  '3+2': { initialSeconds: 180, incrementSeconds: 2 },
  '5+0': { initialSeconds: 300, incrementSeconds: 0 },
  '10+0': { initialSeconds: 600, incrementSeconds: 0 },
  '15+10': { initialSeconds: 900, incrementSeconds: 10 },
};

export type ChessColorChoice = 'random' | 'white' | 'black';

export type MovePayload = {
  from: string;
  to: string;
  promotion?: string;
  expectedVersion: number;
};

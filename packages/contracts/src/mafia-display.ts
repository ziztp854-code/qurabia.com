import type { DisplayActionPayload, DisplayStatePayload } from './display-controller';

export type MafiaDisplayPhase = 'LOBBY' | 'NIGHT' | 'DAY' | 'VOTING' | 'FINISHED';
export type MafiaDisplayPlayerStatus = 'ALIVE' | 'ELIMINATED';
export type MafiaDisplayWinner = 'CITIZENS' | 'KILLERS';

export type MafiaDisplayPlayer = {
  id: string;
  displayName: string;
  status: MafiaDisplayPlayerStatus;
};

export type MafiaDisplayState = {
  title: 'القاتل';
  gameId: string;
  roomCode: string;
  phase: MafiaDisplayPhase;
  round: number;
  phaseEndsAt: string | null;
  winner: MafiaDisplayWinner | null;
  chatEnabled: boolean;
  participantCount: number;
  aliveCount: number;
  eliminatedCount: number;
  players: MafiaDisplayPlayer[];
  publicSummary: string;
};

export type MafiaDisplayStatePayload = DisplayStatePayload<MafiaDisplayState> & {
  mode: 'mafia';
};

export type MafiaHostAction = 'start-game' | 'advance-phase' | 'toggle-chat';
export type MafiaHostActionPayload = DisplayActionPayload<MafiaHostAction, { gameId: string }>;


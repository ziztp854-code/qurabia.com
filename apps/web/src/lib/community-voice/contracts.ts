import type { PublicIdentity } from '@/lib/community/contracts';

export const VOICE_SEAT_LIMIT = 6;
export const VOICE_MEMBER_LIMIT = 24;
export const VOICE_POLL_INTERVAL = 1200;
export const VOICE_REACTIONS = ['👏', '❤️', '🔥', '😂', '👋'] as const;
export type VoiceReaction = (typeof VOICE_REACTIONS)[number];
export type VoiceMember = {
  id: string;
  identity: PublicIdentity;
  role: 'HOST' | 'MODERATOR' | 'MEMBER';
  seat: number | null;
  muted: boolean;
  mutedByModerator: boolean;
  requestedSeat: boolean;
  joinedAt: number;
  connectionEpoch: number;
};
export type VoiceMessage = { id: string; memberId: string; name: string; text: string; at: number };
export type VoiceReactionEvent = {
  id: string;
  memberId: string;
  reaction: VoiceReaction;
  at: number;
};
export type VoiceEntrance = { id: string; memberId: string; identity: PublicIdentity; at: number };
export type VoiceSignal = {
  id: string;
  from: string;
  kind: 'offer' | 'answer' | 'ice';
  payload: string;
  at: number;
};
export type VoiceRoomSummary = {
  id: string;
  code: string;
  name: string;
  imageUrl: string | null;
  ownerId: string;
  memberCount: number;
  createdAt: number;
};
export type VoiceRoomSnapshot = VoiceRoomSummary & {
  revision: number;
  cursor: number;
  status: 'OPEN' | 'CLOSED';
  selfMemberId: string;
  canModerate: boolean;
  members: VoiceMember[];
  messages: VoiceMessage[];
  reactions: VoiceReactionEvent[];
  entrances: VoiceEntrance[];
  signals: VoiceSignal[];
  serverTime: number;
};
export type VoiceIceServer = { urls: string | string[]; username?: string; credential?: string };
export type VoiceRoomResponse = {
  ok: true;
  room: VoiceRoomSnapshot;
  iceServers: VoiceIceServer[];
  turnConfigured: boolean;
};
export type VoiceCommand = {
  clientId: string;
  cursor?: number;
} & (
  | { type: 'join' | 'heartbeat' | 'leave' | 'request-seat' | 'release-seat' | 'close' }
  | { type: 'chat'; text: string }
  | { type: 'reaction'; reaction: VoiceReaction }
  | { type: 'approve-seat'; memberId: string; seat: number }
  | { type: 'mute'; memberId: string; muted: boolean }
  | { type: 'moderator'; memberId: string; enabled: boolean }
  | { type: 'remove' | 'block'; memberId: string }
  | { type: 'signal'; targetMemberId: string; kind: 'offer' | 'answer' | 'ice'; payload: string }
);

/** Public HTTP contracts mirrored from the existing voice API. No server-only state. */
export const ENTRANCE_TIERS = ['ordinary', 'silver', 'gold', 'diamond', 'royal', 'legend'] as const;
export type EntranceTier = (typeof ENTRANCE_TIERS)[number];
export type ProfileVisibility = 'PUBLIC' | 'MEMBERS' | 'PRIVATE';
export type CosmeticKind = 'FRAME' | 'EFFECT' | 'NAME_CARD' | 'BACKGROUND' | 'GLOW';
export type CommunityBadge = {
  id: string;
  name: string;
  description: string;
  category: string;
  rarity: string;
  assetUrl: string | null;
  sensitive: boolean;
  archived: boolean;
  effectId: string | null;
  frameId: string | null;
  grantedAt?: string;
  expiresAt?: string | null;
};
export type CommunityCosmetic = {
  id: string;
  name: string;
  description: string;
  kind: CosmeticKind;
  tier: EntranceTier;
  token: string;
  assetUrl: string | null;
  archived: boolean;
  free: boolean;
  expiresAt?: string | null;
};
export type AppearanceSelection = {
  frameId: string | null;
  effectId: string | null;
  primaryBadgeId: string | null;
  nameCardId: string | null;
  backgroundId: string | null;
  glowId: string | null;
};
export type PublicIdentity = {
  userId: string;
  accountNumber: number;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  badges: CommunityBadge[];
  frame: CommunityCosmetic | null;
  effect: CommunityCosmetic | null;
  primaryBadge: CommunityBadge | null;
};

export type VoiceAccountBadge = 'verified' | 'owner' | 'admin' | 'knight' | 'prince' | 'sultan';
export type VoiceGiftId = 'rose' | 'applause' | 'star' | 'crown';

export const VOICE_CATEGORIES = [
  'مجالس',
  'سوالف',
  'ألعاب',
  'مسابقات',
  'موسيقى',
  'ثقافة',
  'خاصة',
] as const;
export type VoiceCategory = (typeof VOICE_CATEGORIES)[number];
export type VoiceRole = 'host' | 'moderator' | 'speaker' | 'listener';
export type VoiceIdentity = {
  id: string;
  name: string;
  image: string | null;
  accountBadges?: VoiceAccountBadge[];
  /** Public account identifier and server-resolved display entitlements only. */
  accountNumber?: number;
  communityIdentity?: PublicIdentity;
};
export type VoiceParticipant = VoiceIdentity & {
  role: VoiceRole;
  seatIndex: number | null;
  handRaised: boolean;
  requestedSeat: number | null;
  muted: boolean;
  moderatorMuted: boolean;
  joinedAt: number;
  lastSeenAt: number;
  /** Server-only trial gift throttle for this membership. */
  lastGiftAt?: number;
};
export type VoiceMessage = {
  clientId?: string;
  id: string;
  userId: string;
  name: string;
  image: string | null;
  text: string;
  createdAt: number;
  replyTo: string | null;
  pinned: boolean;
  reactions: Record<string, string[]>;
  gift?: { id: VoiceGiftId; recipientId: string; recipientName: string };
};
export type VoiceRoomSettings = {
  name: string;
  description: string;
  category: VoiceCategory;
  cover: string;
  seatCount: number;
  isPrivate: boolean;
  allowMicRequests: boolean;
  chatEnabled: boolean;
  moderatorsCanManage: boolean;
};
export type VoiceRoom = VoiceRoomSettings & {
  id: string;
  hostId: string;
  hostName: string;
  hostImage: string | null;
  createdAt: number;
  active: boolean;
  lockedSeats: number[];
  participantCount: number;
  listenerCount: number;
  speakers: VoiceParticipant[];
  passwordRequired: boolean;
};
export type VoiceSnapshot = {
  room: VoiceRoom;
  participants: VoiceParticipant[];
  messages: VoiceMessage[];
  me: VoiceParticipant | null;
  cursor: number;
  mediaSyncPending?: boolean;
};
export type VoicePreferences = {
  favorites: string[];
  following: string[];
  history: { roomId: string; name: string; visitedAt: number }[];
  blockedUsers: string[];
  mutedUsers: string[];
  privateProfile: boolean;
  notifyFavorites: boolean;
  directMessages?: 'everyone' | 'friends' | 'none';
};
export type VoiceEvent =
  | { type: 'request-seat'; seatIndex?: number }
  | { type: 'approve-seat'; userId: string; seatIndex: number }
  | { type: 'give-mic'; userId: string }
  | { type: 'deny-seat'; userId: string }
  | { type: 'leave-seat' }
  | { type: 'hand'; raised: boolean }
  | { type: 'mute'; muted: boolean }
  | { type: 'moderator-mute'; userId: string; muted: boolean }
  | { type: 'lock-seat'; seatIndex: number; locked: boolean }
  | { type: 'remove'; userId: string }
  | { type: 'role'; userId: string; role: 'moderator' | 'speaker' | 'listener' }
  | { type: 'message'; text: string; replyTo?: string; requestId?: string }
  | { type: 'gift'; giftId: VoiceGiftId; recipientId: string }
  | { type: 'reaction'; messageId: string; emoji: string; requestId?: string }
  | { type: 'pin-message'; messageId: string; pinned: boolean }
  | { type: 'delete-message'; messageId: string }
  | { type: 'report'; messageId?: string; userId?: string; reason: string }
  | { type: 'close' };
export type VoiceCreateInput = VoiceRoomSettings & { password?: string };
export type VoiceJoinInput = { password?: string; invite?: string };
export type VoicePreferencesAction =
  | {
      type: 'favorite' | 'follow' | 'block' | 'mute';
      id: string;
      enabled: boolean;
    }
  | {
      type: 'privacy';
      privateProfile?: boolean;
      notifyFavorites?: boolean;
      directMessages?: 'everyone' | 'friends' | 'none';
    };
export type VoiceList = {
  rooms: VoiceRoom[];
  stats: { activeRooms: number; listeners: number; participants: number };
};

export type VoiceUpdateInput = Partial<VoiceRoomSettings> & { password?: string | null };
export type VoiceMediaGrant = { token: string; url: string; canPublish: boolean; expiresIn: number };
export type VoiceLeaveResult = { ok: true; mediaSyncPending: boolean };

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
  tokenVersion?: number;
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
};
export type VoiceMessage = {
  id: string;
  userId: string;
  name: string;
  image: string | null;
  text: string;
  createdAt: number;
  replyTo: string | null;
  pinned: boolean;
  reactions: Record<string, string[]>;
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
};
export type VoiceRoomState = {
  settings: VoiceRoomSettings;
  host: VoiceIdentity;
  createdAt: number;
  active: boolean;
  lockedSeats: number[];
  participants: VoiceParticipant[];
  messages: VoiceMessage[];
  bannedUsers: string[];
};
export type VoiceEvent =
  | { type: 'request-seat'; seatIndex?: number }
  | { type: 'approve-seat'; userId: string; seatIndex: number }
  | { type: 'deny-seat'; userId: string }
  | { type: 'leave-seat' }
  | { type: 'hand'; raised: boolean }
  | { type: 'mute'; muted: boolean }
  | { type: 'moderator-mute'; userId: string; muted: boolean }
  | { type: 'lock-seat'; seatIndex: number; locked: boolean }
  | { type: 'remove'; userId: string }
  | { type: 'role'; userId: string; role: 'moderator' | 'speaker' | 'listener' }
  | { type: 'message'; text: string; replyTo?: string }
  | { type: 'reaction'; messageId: string; emoji: string }
  | { type: 'pin-message'; messageId: string; pinned: boolean }
  | { type: 'delete-message'; messageId: string }
  | { type: 'report'; messageId?: string; userId?: string; reason: string }
  | { type: 'close' };
export type VoiceCreateInput = VoiceRoomSettings & { password?: string };
export type VoiceJoinInput = { password?: string; invite?: string };
export type VoicePreferencesAction =
  | { type: 'favorite' | 'follow' | 'block' | 'mute'; id: string; enabled: boolean }
  | { type: 'privacy'; privateProfile?: boolean; notifyFavorites?: boolean };
export type VoiceList = {
  rooms: VoiceRoom[];
  stats: { activeRooms: number; listeners: number; participants: number };
};

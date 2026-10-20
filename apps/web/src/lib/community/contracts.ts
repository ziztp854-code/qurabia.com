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
export type PublicProfile = PublicIdentity & {
  bio: string | null;
  coverUrl: string | null;
  joinedAt: string;
  visibility: ProfileVisibility;
  rank: { code: string; name: string };
  level: number;
  xp: number;
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
  isSelf: boolean;
  cosmetics: CommunityCosmetic[];
  achievements: CommunityBadge[];
  rooms: { id: string; name: string; roomNumber: number; role: string }[];
  appearance: AppearanceSelection;
  activeAppearance?: {
    background: CommunityCosmetic | null;
    nameCard: CommunityCosmetic | null;
    glow: CommunityCosmetic | null;
  };
  showRooms: boolean;
  showCollection: boolean;
};
export type MyCommunityProfile = {
  profile: PublicProfile;
  catalog: CommunityCosmetic[];
  ownedCosmetics: CommunityCosmetic[];
  settings: { entranceEnabled: boolean; entranceSound: boolean; reduceEffects: boolean };
};
export type AdminCommunityData = {
  badges: CommunityBadge[];
  cosmetics: CommunityCosmetic[];
  grants: {
    id: string;
    userId: string;
    accountNumber: number;
    name: string;
    badge: CommunityBadge;
    grantedAt: string;
    expiresAt: string | null;
    revokedAt: string | null;
  }[];
  audit: {
    id: string;
    action: string;
    createdAt: string;
    resourceId: string | null;
    targetUserId: string | null;
  }[];
};

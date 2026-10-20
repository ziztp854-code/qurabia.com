export type VoiceAccountBadge = 'verified' | 'owner' | 'admin' | 'knight' | 'prince' | 'sultan';

/** Only database account roles and currently active subscriptions confer these labels. */
export function voiceAccountBadges(
  account: {
    role?: string;
    subscriptions?: { planCode: string; status: string; startedAt: Date; expiresAt: Date }[];
  },
  now = Date.now(),
): VoiceAccountBadge[] {
  const badges: VoiceAccountBadge[] = [];
  if (account.role === 'OWNER') badges.push('verified', 'owner');
  else if (account.role === 'ADMIN') badges.push('verified', 'admin');
  const active = new Set(
    (account.subscriptions ?? [])
      .filter((s) => s.status === 'ACTIVE' && +s.startedAt <= now && +s.expiresAt > now)
      .map((s) => s.planCode),
  );
  if (active.has('SULTAN')) badges.push('sultan');
  else if (active.has('PRINCE')) badges.push('prince');
  else if (active.has('KNIGHT')) badges.push('knight');
  return badges;
}

export const voiceBadgeAccountSelect = {
  role: true,
  subscriptions: {
    where: { status: 'ACTIVE' as const },
    select: { planCode: true, status: true, startedAt: true, expiresAt: true },
  },
} as const;

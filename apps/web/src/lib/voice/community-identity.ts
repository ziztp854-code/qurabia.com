import 'server-only';
import { getUserIdentities } from '@/lib/community/service';
import type { PublicIdentity } from '@/lib/community/contracts';
import type { VoiceIdentity } from './types';

/** Decorative identity must never make existing SFU admission or audio unavailable. */
export async function voiceCommunityIdentities(
  userIds: string[],
): Promise<Map<string, PublicIdentity>> {
  if (!userIds.length) return new Map();
  try {
    return await getUserIdentities([...new Set(userIds)]);
  } catch {
    // A migration/catalog outage disables optional decoration rather than media.
    // Existing account/session, room and SFU authorization remain authoritative.
    return new Map();
  }
}

export function syncVoiceCommunityIdentity(
  member: VoiceIdentity,
  identity: PublicIdentity | undefined,
) {
  if (identity?.userId === member.id) {
    member.accountNumber = identity.accountNumber;
    member.communityIdentity = identity;
  } else {
    // Never keep a stale cached grant or cosmetic after expiry/revocation/outage.
    delete member.communityIdentity;
  }
}

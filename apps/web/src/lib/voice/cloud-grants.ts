import type { VoiceRoomState } from './types';

/** Persist quarantine in the same transaction as the changed room state. */
export function markChangedCloudGrants(state: VoiceRoomState): void {
  for (const [identity, grant] of Object.entries(state.mediaGrants ?? {})) {
    if (!grant.active || grant.revoking) continue;
    const member = state.active
      ? state.participants.find((person) => person.id === (grant.userId ?? identity))
      : undefined;
    const canPublish = !!member && member.seatIndex !== null && member.role !== 'listener' && !member.moderatorMuted;
    if (!grant.userId || !member || !member.membershipId || grant.membershipId !== member.membershipId ||
        grant.tokenVersion !== (member.tokenVersion ?? 0) || grant.joinedAt !== member.joinedAt || grant.canPublish !== canPublish)
      grant.revoking = true;
  }
}

/** Only membership and actual SFU permissions require new reconciliation work. */
export function voiceMediaStateKey(state: VoiceRoomState): string {
  return JSON.stringify({
    active: state.active,
    participants: state.participants.map((person) => ({
      id: person.id, membershipId: person.membershipId ?? null,
      tokenVersion: person.tokenVersion ?? 0, joinedAt: person.joinedAt,
      canPublish: person.seatIndex !== null && person.role !== 'listener' && !person.moderatorMuted,
    })).sort((a, b) => a.id.localeCompare(b.id)),
  });
}

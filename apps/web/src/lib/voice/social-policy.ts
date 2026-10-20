import type { VoicePreferences } from './types';
export function voiceRelationship(
  selfId: string,
  peerId: string,
  self: VoicePreferences,
  peer: VoicePreferences,
) {
  const blocked = self.blockedUsers.includes(peerId) || peer.blockedUsers.includes(selfId);
  const following = self.following.includes(peerId);
  const followsYou = peer.following.includes(selfId);
  const friend = following && followsYou && !blocked;
  const policy = peer.directMessages ?? 'friends';
  return {
    following,
    followsYou: !blocked && followsYou,
    friend,
    canMessage:
      selfId !== peerId && !blocked && (policy === 'everyone' || (policy === 'friends' && friend)),
  };
}

/** Voice metadata is issued by the server; participant metadata updates are disabled. */
export function voiceUserIdForParticipant(identity: string, metadata?: string): string | null {
  if (!identity.startsWith('voice-')) return identity;
  if (!/^voice-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(identity))
    return null;
  try {
    const parsed = JSON.parse(metadata || '{}');
    return typeof parsed.voiceUserId === 'string' && parsed.voiceUserId.length > 0
      ? parsed.voiceUserId
      : null;
  } catch {
    return null;
  }
}

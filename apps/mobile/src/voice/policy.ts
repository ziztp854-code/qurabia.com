export type VoiceMember = {
  id: string;
  seatIndex: number | null;
  role: string;
  moderatorMuted: boolean;
  muted: boolean;
};

export function mayPublishVoice(member: VoiceMember | null | undefined) {
  return Boolean(
    member && member.seatIndex !== null && member.role !== 'listener' && !member.moderatorMuted,
  );
}

export function retryDelay(attempt: number): number | null {
  return [1000, 2000, 4000, 8000][attempt] ?? null;
}

export function terminalVoiceError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const status = 'status' in error ? Number(error.status) : 0;
  const code = 'code' in error ? error.code : '';
  return [400, 401, 403, 404, 410].includes(status) || code === 'MEDIA_SETUP_REQUIRED';
}

export function readVoiceGrant(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('استجابة خدمة الصوت غير صالحة.');
  const grant = value as Record<string, unknown>;
  if (typeof grant.token !== 'string' || !grant.token || typeof grant.url !== 'string')
    throw new Error('استجابة خدمة الصوت غير صالحة.');
  const url = new URL(grant.url);
  if (url.protocol !== 'wss:' || url.username || url.password || url.search || url.hash)
    throw new Error('خدمة الصوت تحتاج اتصال WSS آمنًا.');
  return { token: grant.token, url: url.toString(), canPublish: grant.canPublish === true };
}

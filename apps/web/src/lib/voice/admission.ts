import 'server-only';
import { TokenVerifier } from 'livekit-server-sdk';
import { getPrismaClient } from '@/lib/auth/prisma';
import { VoiceHttpError } from './http';
import { voiceRateLimit } from './identity';
import {
  createVoiceToken,
  voiceMediaConfig,
  VOICE_MEDIA_ROOM_PREFIX,
  VoiceMediaUnavailable,
} from './livekit';
import { withVoiceMediaSnapshot } from './repository';

/** Every external signaling handshake exchanges its bearer for current room rights. */
export async function admitVoiceSignal(token: string) {
  const config = voiceMediaConfig();
  if (!config) throw new VoiceMediaUnavailable();
  let claims;
  try {
    claims = await new TokenVerifier(config.apiKey, config.apiSecret).verify(token);
  } catch {
    throw new VoiceHttpError(401, 'انتهت صلاحية اتصال الصوت.', 'SIGNAL_TOKEN_INVALID');
  }
  const roomName = claims.video?.room;
  if (!claims.sub || !claims.video?.roomJoin || !roomName?.startsWith(VOICE_MEDIA_ROOM_PREFIX))
    throw new VoiceHttpError(403, 'الاتصال غير مصرح به.', 'SIGNAL_FORBIDDEN');
  const roomId = roomName.slice(VOICE_MEDIA_ROOM_PREFIX.length);
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(roomId))
    throw new VoiceHttpError(403, 'الاتصال غير مصرح به.', 'SIGNAL_FORBIDDEN');
  let sessionVersion: unknown;
  try {
    sessionVersion = JSON.parse(claims.metadata || '{}').voiceSessionVersion;
  } catch {
    /* Invalid metadata is denied below. */
  }
  if (!Number.isSafeInteger(sessionVersion) || Number(sessionVersion) < 0)
    throw new VoiceHttpError(401, 'أعد فتح جلسة الصوت.', 'SIGNAL_VERSION_INVALID');
  await voiceRateLimit(claims.sub, true, 'signal-admit');
  const identity = await getPrismaClient().user.findUnique({
    where: { id: claims.sub },
    select: { status: true, tokenVersion: true },
  });
  if (!identity || identity.status !== 'ACTIVE' || identity.tokenVersion !== sessionVersion)
    throw new VoiceHttpError(401, 'انتهت صلاحية الجلسة.', 'SESSION_REVOKED');
  return withVoiceMediaSnapshot(roomId, (snapshot, ledger) => {
    const member = snapshot.participants.find((person) => person.id === claims.sub);
    if (!snapshot.room.active || !member || (member.tokenVersion ?? 0) !== sessionVersion)
      throw new VoiceHttpError(403, 'انضم إلى الغرفة مجددًا.', 'NOT_MEMBER');
    return createVoiceToken(roomId, member, Number(sessionVersion), ledger);
  });
}

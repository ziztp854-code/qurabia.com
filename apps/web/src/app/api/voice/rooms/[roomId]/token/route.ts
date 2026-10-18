import { voiceIdentity, voiceRateLimit } from '@/lib/voice/identity';
import { jsonFailure, jsonSuccess, voiceOrigin, VoiceHttpError } from '@/lib/voice/http';
import { requireVoiceMembership, withVoiceMediaSnapshot } from '@/lib/voice/repository';
import {
  createVoiceToken,
  reconcileVoiceMedia,
  voiceMediaConfig,
  VoiceMediaUnavailable,
} from '@/lib/voice/livekit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: { params: Promise<{ roomId: string }> }) {
  try {
    voiceOrigin(request);
    const identity = await voiceIdentity();
    await voiceRateLimit(identity.id, true, 'media-token');
    const { roomId } = await context.params;
    const snapshot = await requireVoiceMembership(roomId, identity.id);
    if (!snapshot.room.active || !snapshot.me)
      throw new VoiceHttpError(403, 'انضم إلى غرفة نشطة قبل تشغيل الصوت.', 'NOT_MEMBER');
    // Commit strict Cloud revocations before issuing a replacement token.
    if (voiceMediaConfig()?.mode === 'cloud') await reconcileVoiceMedia(roomId);
    // Serialize issuance with moderation and read current unfiltered membership.
    const grant = await withVoiceMediaSnapshot(roomId, (current, ledger) => {
      const member = current.participants.find((person) => person.id === identity.id);
      if (!current.room.active || !member)
        throw new VoiceHttpError(403, 'انضم إلى غرفة نشطة قبل تشغيل الصوت.', 'NOT_MEMBER');
      if ((member.tokenVersion ?? 0) !== (identity.tokenVersion ?? 0))
        throw new VoiceHttpError(401, 'انتهت صلاحية الجلسة.', 'SESSION_REVOKED');
      return createVoiceToken(roomId, member, identity.tokenVersion ?? 0, ledger);
    });
    return jsonSuccess(grant);
  } catch (error) {
    if (error instanceof VoiceMediaUnavailable)
      return jsonFailure(new VoiceHttpError(503, error.message, 'MEDIA_SETUP_REQUIRED'));
    return jsonFailure(error);
  }
}

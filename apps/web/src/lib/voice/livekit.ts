import 'server-only';
import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import type { VoiceParticipant, VoiceSnapshot } from './types';
import { withVoiceMediaSnapshot } from './repository';

export const VOICE_MEDIA_ROOM_PREFIX = 'tahaddi-voice-';
export const VOICE_TOKEN_TTL_SECONDS = 60;

export class VoiceMediaUnavailable extends Error {
  constructor() {
    super('الصوت غير مهيأ بعد. يلزم إعداد خدمة LiveKit الآمنة.');
  }
}

function safeMediaUrl(raw: string, internal = false) {
  const parsed = new URL(raw);
  if (parsed.username || parsed.password || parsed.search || parsed.hash)
    throw new Error('Invalid media URL');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  const secure = parsed.protocol === 'wss:' || (internal && parsed.protocol === 'https:');
  const localPlaintext =
    local && (parsed.protocol === 'ws:' || (internal && parsed.protocol === 'http:'));
  if (!secure && !localPlaintext) throw new Error('Media URL requires TLS');
  return parsed.toString();
}
export function voiceMediaConfig() {
  const url = process.env.LIVEKIT_URL;
  const internalUrl = process.env.LIVEKIT_INTERNAL_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !internalUrl || !apiKey || !apiSecret) return null;
  try {
    const client = safeMediaUrl(url);
    const internal = safeMediaUrl(internalUrl, true);
    // Browsers must only reach the admission gateway, never the private SFU.
    if (
      new URL(client.replace(/^ws/, 'http')).origin ===
      new URL(internal.replace(/^ws/, 'http')).origin
    )
      return null;
    return { url: client, internalUrl: internal, apiKey, apiSecret };
  } catch {
    return null;
  }
}

export function voiceMediaRoomName(roomId: string) {
  return `${VOICE_MEDIA_ROOM_PREFIX}${roomId}`;
}
export function canPublishVoice(participant: VoiceParticipant | null | undefined) {
  return Boolean(
    participant &&
    participant.seatIndex !== null &&
    participant.role !== 'listener' &&
    !participant.moderatorMuted,
  );
}

export async function createVoiceToken(
  roomId: string,
  participant: VoiceParticipant,
  sessionVersion = participant.tokenVersion ?? 0,
) {
  const config = voiceMediaConfig();
  if (!config) throw new VoiceMediaUnavailable();
  const canPublish = canPublishVoice(participant);
  const token = new AccessToken(config.apiKey, config.apiSecret, {
    identity: participant.id,
    name: participant.name,
    metadata: JSON.stringify({ voiceSessionVersion: sessionVersion }),
    ttl: VOICE_TOKEN_TTL_SECONDS,
  });
  token.addGrant({
    roomJoin: true,
    room: voiceMediaRoomName(roomId),
    canPublish,
    canPublishSources: [TrackSource.MICROPHONE],
    canSubscribe: true,
    canPublishData: false,
    canUpdateOwnMetadata: false,
  });
  return {
    token: await token.toJwt(),
    url: config.url,
    canPublish,
    expiresIn: VOICE_TOKEN_TTL_SECONDS,
  };
}

/** Apply authoritative app membership to SFU permissions. Never trust a client role. */
export async function reconcileVoiceMedia(roomId: string, _snapshot?: VoiceSnapshot) {
  void _snapshot; // Caller revisions are never used to grant media permissions.
  if (!voiceMediaConfig()) return;
  const startBy = Date.now() + 12_000;
  return withVoiceMediaSnapshot(roomId, (snapshot) => {
    // Leave room for the three sequential 2s RPC stages within the 20s DB lock.
    // A delayed DB read must not start media writes after most of the lock budget.
    if (Date.now() > startBy) throw new Error('VoiceMediaDeadlineExceeded');
    return applyVoiceMediaPermissions(roomId, snapshot);
  });
}

async function applyVoiceMediaPermissions(roomId: string, snapshot: VoiceSnapshot) {
  const config = voiceMediaConfig();
  if (!config) return;
  const serviceUrl = config.internalUrl.replace(/^ws/, 'http');
  const client = new RoomServiceClient(serviceUrl, config.apiKey, config.apiSecret, {
    requestTimeout: 2,
    failover: false,
  });
  const roomName = voiceMediaRoomName(roomId);
  let mediaParticipants;
  try {
    mediaParticipants = await client.listParticipants(roomName);
  } catch (error) {
    // The first join has no SFU room yet. Other errors must reach the caller.
    if (error instanceof Error && 'code' in error && error.code === 'not_found') return;
    throw error;
  }
  const outcomes = await Promise.allSettled(
    mediaParticipants.map(async (media) => {
      const member = snapshot.room.active
        ? snapshot.participants.find((p) => p.id === media.identity)
        : undefined;
      if (!member) {
        await client.removeParticipant(roomName, media.identity);
        return;
      }
      const canPublish = canPublishVoice(member);
      const permission = media.permission;
      if (
        !permission ||
        permission.canPublish !== canPublish ||
        !permission.canSubscribe ||
        permission.canPublishData ||
        permission.canUpdateMetadata ||
        permission.canPublishSources.length !== 1 ||
        permission.canPublishSources[0] !== TrackSource.MICROPHONE
      )
        await client.updateParticipant(roomName, media.identity, undefined, {
          canPublish,
          canPublishSources: [TrackSource.MICROPHONE],
          canSubscribe: true,
          canPublishData: false,
          canUpdateMetadata: false,
        });
      if (!canPublish) {
        const muted = await Promise.allSettled(
          media.tracks
            .filter((t) => t.source === TrackSource.MICROPHONE && !t.muted)
            .map((t) => client.mutePublishedTrack(roomName, media.identity, t.sid, true)),
        );
        const failed = muted.find((result) => result.status === 'rejected');
        if (failed?.status === 'rejected') throw failed.reason;
      }
    }),
  );
  // Wait for every bounded RPC before releasing the shared database lock.
  const failed = outcomes.find((result) => result.status === 'rejected');
  if (failed?.status === 'rejected') throw failed.reason;
}

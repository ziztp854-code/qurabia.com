import 'server-only';
import { AccessToken, RoomServiceClient, TrackSource, DataPacket_Kind } from 'livekit-server-sdk';
import type { VoiceMediaLedger, VoiceParticipant, VoiceSnapshot } from './types';
import { withVoiceMediaSnapshot } from './repository';
import { VoiceHttpError } from './http';

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
  if (!url || !apiKey || !apiSecret) return null;
  try {
    const client = safeMediaUrl(url);
    if (process.env.LIVEKIT_MODE === 'cloud') {
      const parsed = new URL(client);
      // Cloud revocation is a provider feature, never enable it for arbitrary SFUs.
      if (
        !/^[a-z0-9-]+\.livekit\.cloud$/.test(parsed.hostname) ||
        parsed.protocol !== 'wss:' ||
        parsed.port ||
        parsed.pathname !== '/' ||
        internalUrl
      )
        return null;
      return { mode: 'cloud' as const, url: client, internalUrl: client, apiKey, apiSecret };
    }
    if (process.env.LIVEKIT_MODE && process.env.LIVEKIT_MODE !== 'gateway') return null;
    if (!internalUrl) return null;
    const internal = safeMediaUrl(internalUrl, true);
    // Browsers must only reach the admission gateway, never the private SFU.
    if (
      new URL(client.replace(/^ws/, 'http')).origin ===
      new URL(internal.replace(/^ws/, 'http')).origin
    )
      return null;
    return { mode: 'gateway' as const, url: client, internalUrl: internal, apiKey, apiSecret };
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
  ledger?: VoiceMediaLedger,
) {
  const config = voiceMediaConfig();
  if (!config) throw new VoiceMediaUnavailable();
  const canPublish = canPublishVoice(participant);
  if (config.mode === 'cloud') {
    if (!ledger) throw new VoiceMediaUnavailable();
    const previous = ledger[participant.id];
    if (previous?.active && !sameCloudGrant(previous, participant))
      throw new VoiceHttpError(409, 'تحدّثت صلاحيات الصوت. أعد الاتصال بعد لحظات.', 'MEDIA_RETRY');
    // A strict cutoff also rejects tokens minted earlier in the same second.
    // Wait for the next explicit client retry rather than issue an unusable JWT.
    if (Math.floor(Date.now() / 1000) < (ledger[participant.id]?.revokedBefore ?? 0))
      throw new VoiceHttpError(409, 'تحدّثت صلاحيات الصوت. أعد الاتصال بعد لحظات.', 'MEDIA_RETRY');
    ledger[participant.id] = {
      active: true,
      canPublish,
      tokenVersion: sessionVersion,
      joinedAt: participant.joinedAt,
      revokedBefore: ledger[participant.id]?.revokedBefore ?? 0,
    };
  }
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
export async function reconcileVoiceMedia(
  roomId: string,
  _snapshot?: VoiceSnapshot,
  periodic = false,
) {
  void _snapshot; // Caller revisions are never used to grant media permissions.
  if (!voiceMediaConfig()) return;
  const startBy = Date.now() + 12_000;
  return withVoiceMediaSnapshot(roomId, async (snapshot, ledger, checkpoint) => {
    if (periodic && checkpoint && Date.now() - checkpoint.checkedAt < 2000) return;
    // Leave room for the three sequential 2s RPC stages within the 20s DB lock.
    // A delayed DB read must not start media writes after most of the lock budget.
    if (Date.now() > startBy) throw new Error('VoiceMediaDeadlineExceeded');
    await applyVoiceMediaPermissions(roomId, snapshot, ledger);
    if (checkpoint) checkpoint.checkedAt = Date.now();
  });
}

function mediaClient(config: NonNullable<ReturnType<typeof voiceMediaConfig>>) {
  return new RoomServiceClient(
    config.internalUrl.replace(/^ws/, 'http'),
    config.apiKey,
    config.apiSecret,
    {
      requestTimeout: 2,
      failover: false,
    },
  );
}
function sameCloudGrant(grant: VoiceMediaLedger[string], member: VoiceParticipant) {
  return (
    grant.canPublish === canPublishVoice(member) &&
    grant.tokenVersion === (member.tokenVersion ?? 0) &&
    grant.joinedAt === member.joinedAt
  );
}
async function revokeCloudGrant(
  client: RoomServiceClient,
  roomId: string,
  identity: string,
  ledger: VoiceMediaLedger,
) {
  const cutoff = Math.ceil(Date.now() / 1000) + 1;
  // Explicit cutoff has no default one-minute buffer, including offline identities.
  await client.removeParticipant(voiceMediaRoomName(roomId), identity, {
    revokeTokenTs: BigInt(cutoff),
  });
  ledger[identity] = {
    active: false,
    canPublish: false,
    tokenVersion: 0,
    joinedAt: 0,
    revokedBefore: cutoff,
  };
}
async function applyVoiceMediaPermissions(
  roomId: string,
  snapshot: VoiceSnapshot,
  ledger: VoiceMediaLedger,
) {
  const config = voiceMediaConfig();
  if (!config) return;
  const client = mediaClient(config);
  const roomName = voiceMediaRoomName(roomId);
  if (config.mode === 'cloud') {
    const outcomes = await Promise.allSettled(
      Object.entries(ledger).map(async ([id, grant]) => {
        const member = snapshot.room.active
          ? snapshot.participants.find((p) => p.id === id)
          : undefined;
        if (grant.active && (!member || !sameCloudGrant(grant, member)))
          await revokeCloudGrant(client, roomId, id, ledger);
        // Cloud refresh tokens expire in ten minutes. Retain inactive tombstones
        // beyond that window; never discard a still-active grant based on age.
        if (!grant.active && Date.now() / 1000 > grant.revokedBefore + 660) delete ledger[id];
      }),
    );
    const failed = outcomes.find((r) => r.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
  }
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
      if (
        config.mode === 'cloud' &&
        (!member ||
          !ledger[media.identity]?.active ||
          !sameCloudGrant(ledger[media.identity], member))
      ) {
        // A revocation in the first stage already removed this identity.
        if (ledger[media.identity]?.active !== false)
          await revokeCloudGrant(client, roomId, media.identity, ledger);
        return;
      }
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
      ) {
        if (config.mode === 'cloud') {
          await revokeCloudGrant(client, roomId, media.identity, ledger);
          return;
        }
        await client.updateParticipant(roomName, media.identity, undefined, {
          canPublish,
          canPublishSources: [TrackSource.MICROPHONE],
          canSubscribe: true,
          canPublishData: false,
          canUpdateMetadata: false,
        });
      }
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

/** Trusted invalidation only; clients fetch authorized state and cannot publish data. */
export async function notifyVoiceRoomChanged(roomId: string, cursor: number) {
  const config = voiceMediaConfig();
  if (!config) return;
  try {
    await mediaClient(config).sendData(
      voiceMediaRoomName(roomId),
      new TextEncoder().encode(JSON.stringify({ roomId, cursor })),
      DataPacket_Kind.RELIABLE,
      { topic: 'tahaddi-voice-refresh-v1' },
    );
  } catch {
    /* Polling recovers from notification transport failure. */
  }
}

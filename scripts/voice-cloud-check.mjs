// Runs on Vercel production builds, before the new Cloud mode becomes live.
// Only touches a uniquely named test room and never logs credentials or tokens.
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { checkCloudAudio } from './voice-cloud-audio-check.mjs';

if (process.env.VERCEL_ENV !== 'production' || process.env.LIVEKIT_MODE !== 'cloud') {
  console.log('[voice-cloud-check] skipped outside production Cloud mode');
  process.exit(0);
}
const requireWeb = createRequire(new URL('../apps/web/package.json', import.meta.url));
const { AccessToken, RoomServiceClient, TrackSource } = requireWeb('livekit-server-sdk');
const requireSdk = createRequire(requireWeb.resolve('livekit-server-sdk'));
const { SignalResponse } = requireSdk('@livekit/protocol');
const endpoint = new URL(process.env.LIVEKIT_URL);
if (
  !/^[a-z0-9-]+\.livekit\.cloud$/.test(endpoint.hostname) ||
  endpoint.protocol !== 'wss:' ||
  endpoint.pathname !== '/' ||
  endpoint.port ||
  endpoint.username ||
  endpoint.password ||
  endpoint.search ||
  endpoint.hash
)
  throw new Error('Invalid Cloud project endpoint');
if (
  !process.env.LIVEKIT_API_KEY ||
  !process.env.LIVEKIT_API_SECRET ||
  process.env.LIVEKIT_INTERNAL_URL
)
  throw new Error('Incomplete or conflicting Cloud configuration');
const origins = JSON.parse(
  await readFile(new URL('../config/voice-cloud-origins.json', import.meta.url), 'utf8'),
);
const policy = JSON.parse(
  await readFile(new URL('../vercel.json', import.meta.url), 'utf8'),
).headers[0].headers.find((h) => h.key === 'Content-Security-Policy').value;
if (
  !origins.includes(endpoint.origin) ||
  origins.some((origin) => !policy.split(/[ ;]/).includes(origin))
)
  throw new Error('Cloud CSP is incomplete');
const roomName = `voice-cloud-signal-check-${randomUUID()}`;
const client = new RoomServiceClient(
  endpoint.href.replace(/^ws/, 'http'),
  process.env.LIVEKIT_API_KEY,
  process.env.LIVEKIT_API_SECRET,
  { requestTimeout: 8, failover: false },
);
const sockets = new Set();
let phase = 'Cloud room API';
const permission = (publish) => ({
  canPublish: publish,
  canSubscribe: true,
  canPublishData: false,
  canUpdateMetadata: false,
  canPublishSources: [TrackSource.MICROPHONE],
});
async function token(identity, publish = true) {
  const jwt = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
    identity,
    ttl: 60,
    metadata: JSON.stringify({ voiceSessionVersion: 0 }),
  });
  jwt.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: publish,
    canSubscribe: true,
    canPublishData: false,
    canUpdateOwnMetadata: false,
    canPublishSources: [TrackSource.MICROPHONE],
  });
  return jwt.toJwt();
}

function join(jwt) {
  return new Promise((resolve, reject) => {
    const url = new URL('rtc', endpoint);
    url.search = new URLSearchParams({
      access_token: jwt,
      protocol: '15',
      sdk: 'js',
      version: '2.23.0',
      auto_subscribe: '0',
    });
    const socket = new WebSocket(url);
    sockets.add(socket);
    socket.binaryType = 'arraybuffer';
    const session = { socket, refreshed: [], participant: null };
    let settled = false;
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('Signal join timed out'));
    }, 8_000);
    const deny = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error('Signal join rejected'));
      }
    };
    socket.addEventListener('error', deny);
    socket.addEventListener('close', () => {
      sockets.delete(socket);
      deny();
    });
    socket.addEventListener('message', (event) => {
      try {
        const response =
          typeof event.data === 'string'
            ? SignalResponse.fromJson(JSON.parse(event.data))
            : SignalResponse.fromBinary(new Uint8Array(event.data));
        if (response.message.case === 'refreshToken')
          session.refreshed.push(response.message.value);
        if (response.message.case === 'join' && !settled) {
          session.participant = response.message.value.participant;
          settled = true;
          clearTimeout(timer);
          resolve(session);
        }
        if (response.message.case === 'leave') deny();
      } catch {
        deny();
      }
    });
  });
}
async function rejectsToken(jwt) {
  const validation = new URL('rtc/validate', endpoint.href.replace(/^ws/, 'http'));
  validation.search = new URLSearchParams({
    access_token: jwt,
    protocol: '15',
    sdk: 'js',
    version: '2.23.0',
  });
  const response = await fetch(validation, { signal: AbortSignal.timeout(8_000) });
  if (response.status !== 401)
    throw new Error('Revoked token did not receive an authentication rejection');
  try {
    const session = await join(jwt);
    session.socket.close();
  } catch (error) {
    if (error.message === 'Signal join rejected') return;
    throw error; // A timeout alone is not evidence of revocation.
  }
  throw new Error('Revoked token unexpectedly rejoined');
}
let created = false;
try {
  await client.createRoom({ name: roomName, emptyTimeout: 30, maxParticipants: 2 });
  created = true;
  phase = 'initial signal join';
  const original = await token('cloud-check-speaker');
  const session = await join(original);
  if (!session.participant?.permission?.canPublish)
    throw new Error('Initial speaker grant missing');
  console.log('[voice-cloud-check] authenticated Cloud room and signal join passed');
  phase = 'regional CSP';
  const regions = await fetch(new URL('settings/regions', endpoint.href.replace(/^ws/, 'http')), {
    headers: { Authorization: `Bearer ${original}` },
    signal: AbortSignal.timeout(8_000),
  });
  if (!regions.ok) throw new Error('Cloud region discovery failed');
  const settings = await regions.json();
  const missing = (settings.regions ?? [])
    .map((region) => new URL(region.url).origin)
    .filter((origin) => !origins.includes(origin));
  if (missing.length) {
    console.error('[voice-cloud-check] missing CSP region origins:', missing);
    throw new Error('Regional CSP allowlist needs update');
  }
  phase = 'Cloud token refresh';
  await client.updateParticipant(roomName, 'cloud-check-speaker', undefined, permission(false));
  for (let attempt = 0; attempt < 25 && !session.refreshed.length; attempt++) await delay(100);
  if (!session.refreshed.length) throw new Error('Cloud refreshed token was not observed');
  const refreshed = session.refreshed.at(-1);
  phase = 'strict removal and cached-token replay';
  await client.removeParticipant(roomName, 'cloud-check-speaker', {
    revokeTokenTs: BigInt(Math.ceil(Date.now() / 1000) + 1),
  });
  await rejectsToken(original);
  await rejectsToken(refreshed);
  console.log(
    '[voice-cloud-check] original and freshly refreshed tokens rejected after strict removal',
  );
  const offline = await token('cloud-check-offline');
  phase = 'offline identity revocation';
  await client.removeParticipant(roomName, 'cloud-check-offline', {
    revokeTokenTs: BigInt(Math.ceil(Date.now() / 1000) + 1),
  });
  await rejectsToken(offline);
  console.log('[voice-cloud-check] offline identity token revocation passed');
  await delay(2_100);
  phase = 'fresh listener reconnect';
  const listener = await join(await token('cloud-check-speaker', false));
  if (
    listener.participant?.permission?.canPublish ||
    !listener.participant?.permission?.canSubscribe
  )
    throw new Error('Replacement listener permissions are incorrect');
  console.log(
    '[voice-cloud-check] fresh authorized listener reconnect passed; regional CSP verified',
  );
} catch {
  // SDK errors may include request URLs. Keep build logs free of tokens.
  console.error(`[voice-cloud-check] FAILED at ${phase}; production activation blocked`);
  process.exitCode = 1;
} finally {
  for (const socket of sockets) socket.close();
  if (created) {
    try {
      await client.deleteRoom(roomName);
    } catch {
      console.error('[voice-cloud-check] test-room cleanup failed');
      process.exitCode = 1;
    }
  }
}
if (!process.exitCode) {
  try {
    await checkCloudAudio();
  } catch (error) {
    console.error(`[voice-cloud-audio] ${error.message}; production activation blocked`);
    process.exitCode = 1;
  }
}

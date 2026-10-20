import 'server-only';
import { createHmac } from 'node:crypto';
import type { VoiceIceServer } from './contracts';

function urls(value: string | undefined, kind: 'stun' | 'turn') {
  const pattern =
    /^(?:stuns?|turns?):(?:\[[A-Fa-f0-9:]+\]|[A-Za-z0-9.-]+)(?::\d{1,5})?(?:\?transport=(?:udp|tcp))?$/;
  return (value ?? '')
    .split(',')
    .map((url) => url.trim())
    .filter(
      (url) =>
        url.length <= 200 &&
        (url.startsWith(`${kind}:`) || url.startsWith(`${kind}s:`)) &&
        pattern.test(url),
    )
    .slice(0, 4);
}

/** coTURN REST credentials expire after ten minutes; shared secrets never leave the server. */
export function voiceIceConfiguration(
  userId: string,
  now = Date.now(),
): { iceServers: VoiceIceServer[]; turnConfigured: boolean } {
  const stunUrls = urls(process.env.VOICE_STUN_URLS ?? 'stun:stun.cloudflare.com:3478', 'stun');
  const turnUrls = urls(process.env.VOICE_TURN_URLS, 'turn');
  const turnSecret = process.env.VOICE_TURN_SHARED_SECRET;
  const iceServers: VoiceIceServer[] = stunUrls.length ? [{ urls: stunUrls }] : [];
  if (turnUrls.length && turnSecret) {
    const username = `${Math.floor(now / 1000) + 600}:${userId}`;
    iceServers.push({
      urls: turnUrls,
      username,
      credential: createHmac('sha1', turnSecret).update(username).digest('base64'),
    });
  }
  return { iceServers, turnConfigured: Boolean(turnUrls.length && turnSecret) };
}

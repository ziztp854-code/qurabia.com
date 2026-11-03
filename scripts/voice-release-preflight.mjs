import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const PATH = '/realtime/health/voice-reconciliation';
const MAX_AGE_MS = 65_000;
const MAX_CLOCK_SKEW_MS = 5_000;

function endpointFor(origin, allowLoopback) {
  try {
    const url = new URL(origin);
    const isLoopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(allowLoopback && isLoopback && url.protocol === 'http:')) ||
        url.username || url.password || url.pathname !== '/' || url.search || url.hash)
      return null;
    return new URL(PATH, url);
  } catch { return null; }
}

async function probe(endpoint, timeoutMs) {
  try {
    const response = await fetch(endpoint, {
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs),
      headers: { 'Cache-Control': 'no-cache, no-store', Pragma: 'no-cache' },
    });
    if (response.status !== 200 || !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(response.headers.get('cache-control') ?? '')) return null;
    const body = await response.json();
    const age = Date.now() - body.lastSuccessAtMs;
    if (body.ready !== true || body.state !== 'ready' ||
        !Number.isSafeInteger(body.lastSuccessAtMs) || age > MAX_AGE_MS || age < -MAX_CLOCK_SKEW_MS ||
        typeof body.processInstanceId !== 'string' || !/^[a-zA-Z0-9-]{1,128}$/.test(body.processInstanceId) ||
        !Number.isSafeInteger(body.successSequence) || body.successSequence < 2) return null;
    return body;
  } catch { return null; }
}

/** Read-only preflight. Readiness attests an authenticated, empty backlog on the worker. */
export async function runVoicePreflight({ origin, intervalMs = 5000, timeoutMs = 10000, allowLoopback = false }) {
  const endpoint = endpointFor(origin, allowLoopback);
  if (!endpoint || !Number.isSafeInteger(intervalMs) || intervalMs < 1 ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 1) return { ok: false, reason: 'invalid configuration' };
  const first = await probe(endpoint, timeoutMs);
  if (!first) return { ok: false, reason: 'first readiness check failed' };
  await delay(intervalMs);
  const second = await probe(endpoint, timeoutMs);
  if (!second || second.processInstanceId !== first.processInstanceId ||
      second.successSequence <= first.successSequence || second.lastSuccessAtMs <= first.lastSuccessAtMs)
    return { ok: false, reason: 'second readiness check or worker progress failed' };
  return { ok: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runVoicePreflight({ origin: process.env.VOICE_REALTIME_ORIGIN });
  if (!result.ok) {
    console.error(`Voice release preflight FAILED: ${result.reason}. Keep the voice gate in place.`);
    process.exitCode = 1;
  } else {
    console.log('Voice release preflight passed two fresh worker readiness checks.');
  }
}

import 'server-only';
import { after } from 'next/server';
import { z } from 'zod';

export const KINGDOMS_PUSH_CAPABILITY = 'revision-push-v1';
const notificationSchema = z.object({
  worldId: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  nextEventAt: z.number().int().nonnegative().max(8_640_000_000_000_000).nullable(),
}).strict();
export type KingdomsNotification = z.infer<typeof notificationSchema>;
type Environment = Readonly<Record<string, string | undefined>>;

/** Reuse the existing Render origin and shared worker secret; never send client state. */
function publicationConfig(env: Environment = process.env) {
  const secret = env.KINGDOMS_WORKER_SECRET;
  if (!secret || secret.length < 32 || !env.NEXT_PUBLIC_REALTIME_URL) return null;
  try {
    const origin = new URL(env.NEXT_PUBLIC_REALTIME_URL);
    if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password ||
      origin.pathname !== '/' || origin.search || origin.hash ||
      (env.NODE_ENV === 'production' && origin.protocol !== 'https:')) return null;
    return { url: new URL('/realtime/kingdoms/revision/', origin).toString(), secret };
  } catch { return null; }
}

async function publish(body: KingdomsNotification | { capability: string; probe: true }, env?: Environment) {
  const config = publicationConfig(env);
  if (!config) return false;
  try {
    const response = await fetch(config.url, {
      method: 'POST', redirect: 'error', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.secret}` },
      body: JSON.stringify(body), signal: AbortSignal.timeout(1000),
    });
    if (!response.ok) return false;
    const result: unknown = await response.json();
    return Boolean(result && typeof result === 'object' && 'success' in result && result.success === true &&
      (!('probe' in body) || ('capability' in result && result.capability === KINGDOMS_PUSH_CAPABILITY)));
  } catch { return false; }
}

/** One probe per central worker tick. No subscriber or database query is created here. */
export async function kingdomsRealtimeCapability(env?: Environment) {
  return {
    capability: KINGDOMS_PUSH_CAPABILITY,
    notificationsConfigured: await publish({ capability: KINGDOMS_PUSH_CAPABILITY, probe: true }, env),
  };
}

/** Schedule only after transaction success. A notification outage cannot reject a saved command. */
export function queueKingdomsNotification(change: KingdomsNotification) {
  const parsed = notificationSchema.safeParse(change);
  if (!parsed.success || !publicationConfig()) return;
  try {
    after(async () => { await publish(parsed.data); });
  } catch {
    // Non-request callers keep durable state; the central worker/authorized resync recovers it.
  }
}

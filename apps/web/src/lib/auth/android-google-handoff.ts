import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { isAndroidGoogleValue } from './android-google-protocol';

const namespace = 'tahaddi:android-google:';
const grantLifetimeMs = 2 * 60 * 1000;
export const androidGoogleBrowserLifetimeMs = 15 * 60 * 1000;

type GrantRecord = { token: string; identifier: string; expires: Date };
type GrantIdentity = { id: string; tokenVersion: number };

// VerificationToken already has a unique token and an expiry index. Its
// identifier namespace keeps Android grants separate from email verification.
export interface AndroidGoogleGrantStore {
  create(args: { data: GrantRecord }): Promise<unknown>;
  findUnique(args: { where: { token: string } }): Promise<GrantRecord | null>;
  deleteMany(args: {
    where: {
      token?: string;
      identifier: string | { startsWith: string };
      expires: { gt?: Date; lte?: Date };
    };
  }): Promise<{ count: number }>;
}

const digest = (value: string) => createHash('sha256').update(value).digest('base64url');

export async function issueAndroidGoogleGrant(
  store: AndroidGoogleGrantStore,
  identity: GrantIdentity,
  state: string,
  challenge: string,
  now = new Date(),
) {
  if (!isAndroidGoogleValue(state) || !isAndroidGoogleValue(challenge)) {
    throw new Error('Invalid Android Google handoff request');
  }

  const code = randomBytes(32).toString('base64url');
  const identifier = namespace + JSON.stringify([state, challenge, identity.id, identity.tokenVersion]);
  await store.deleteMany({ where: { identifier: { startsWith: namespace }, expires: { lte: now } } });
  await store.create({
    data: { token: digest(code), identifier, expires: new Date(now.getTime() + grantLifetimeMs) },
  });
  return code;
}

export async function redeemAndroidGoogleGrant(
  store: AndroidGoogleGrantStore,
  values: { code?: string; state?: string; verifier?: string },
  now = new Date(),
): Promise<GrantIdentity | null> {
  const { code, state, verifier } = values;
  if (!isAndroidGoogleValue(code) || !isAndroidGoogleValue(state) || !isAndroidGoogleValue(verifier)) {
    return null;
  }

  const token = digest(code);
  const record = await store.findUnique({ where: { token } });
  if (!record || record.expires <= now || !record.identifier.startsWith(namespace)) return null;

  const [boundState, challenge, id, tokenVersion] = JSON.parse(record.identifier.slice(namespace.length)) as unknown[];
  if (
    state !== boundState || !isAndroidGoogleValue(challenge) ||
    !timingSafeEqual(Buffer.from(challenge), Buffer.from(digest(verifier))) ||
    typeof id !== 'string' || typeof tokenVersion !== 'number'
  ) return null;

  const consumed = await store.deleteMany({
    where: { token, identifier: record.identifier, expires: { gt: now } },
  });
  return consumed.count === 1 ? { id, tokenVersion } : null;
}

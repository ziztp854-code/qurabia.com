import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  issueAndroidGoogleGrant,
  redeemAndroidGoogleGrant,
  type AndroidGoogleGrantStore,
} from './android-google-handoff';

function fixture() {
  const records = new Map<string, { token: string; expires: Date; identifier: string }>();
  const store: AndroidGoogleGrantStore = {
    async create({ data }) {
      records.set(data.token, data);
    },
    async findUnique({ where }) {
      return records.get(where.token) ?? null;
    },
    async deleteMany({ where }) {
      let count = 0;
      for (const [token, value] of records) {
        if (typeof where.identifier === 'string' && value.identifier !== where.identifier) continue;
        if (typeof where.identifier === 'object' && !value.identifier.startsWith(where.identifier.startsWith)) continue;
        if (where.token && where.token !== token) continue;
        if (where.expires.gt && value.expires <= where.expires.gt) continue;
        if (where.expires.lte && value.expires > where.expires.lte) continue;
        records.delete(token);
        count++;
      }
      return { count };
    },
  };
  const now = new Date('2026-11-19T12:00:00Z');
  const verifier = randomBytes(32).toString('base64url');
  const state = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { store, records, now, verifier, state, challenge };
}

describe('Android Google session handoff', () => {
  it('stores a hash and only redeems the grant once even with concurrent requests', async () => {
    const { store, records, now, state, verifier, challenge } = fixture();
    const code = await issueAndroidGoogleGrant(store, { id: 'user-a', tokenVersion: 2 }, state, challenge, now);
    expect(records.has(code)).toBe(false);
    const inputs = { code, state, verifier };
    const results = await Promise.all([
      redeemAndroidGoogleGrant(store, inputs, now),
      redeemAndroidGoogleGrant(store, inputs, now),
    ]);
    expect(results.filter(Boolean)).toEqual([{ id: 'user-a', tokenVersion: 2 }]);
    expect(await redeemAndroidGoogleGrant(store, inputs, now)).toBeNull();
  });

  it('rejects a wrong proof, a wrong state, and expired grants', async () => {
    const { store, now, state, verifier, challenge } = fixture();
    const code = await issueAndroidGoogleGrant(store, { id: 'user-a', tokenVersion: 0 }, state, challenge, now);
    await expect(redeemAndroidGoogleGrant(store, { code, state, verifier: randomBytes(32).toString('base64url') }, now)).resolves.toBeNull();
    await expect(redeemAndroidGoogleGrant(store, { code, state: randomBytes(32).toString('base64url'), verifier }, now)).resolves.toBeNull();
    await expect(redeemAndroidGoogleGrant(store, { code, state, verifier }, new Date(now.getTime() + 180_000))).resolves.toBeNull();
  });
});

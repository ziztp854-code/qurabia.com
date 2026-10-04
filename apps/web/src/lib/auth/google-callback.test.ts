import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { Account } from 'next-auth';
import type { Adapter, AdapterUser } from 'next-auth/adapters';
import { decode, encode, type JWT, type JWTOptions } from 'next-auth/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock('./prisma', () => ({
  hasDatabaseUrl: () => true,
  getPrismaClient: () => ({ user: { findUnique: database.findUnique } }),
}));
vi.mock('@next-auth/prisma-adapter', () => ({ PrismaAdapter: () => undefined }));

import { authOptions } from './options';

// JOSE uses Node's typed arrays; jsdom supplies a separate Uint8Array realm.
vi.stubGlobal('Uint8Array', Object.getPrototypeOf(Buffer.prototype).constructor);

type CallbackParameters = {
  sessionToken?: string;
  profile: AdapterUser;
  account: Account;
  options: {
    adapter: Adapter;
    jwt: JWTOptions;
    session: { strategy: 'jwt'; maxAge: number; generateSessionToken: () => string };
    events: Record<string, never>;
    provider: { id: string };
  };
};

// Private exports are resolved from the installed package to test its actual contract.
const require = createRequire(import.meta.url);
const callbackHandler = require(path.join(
  path.dirname(require.resolve('next-auth')),
  'core/lib/callback-handler.js',
)).default as (params: CallbackParameters) => Promise<{
  user: AdapterUser;
  session: JWT | null;
  isNewUser: boolean;
}>;

const secret = randomUUID();
const currentUser = {
  id: 'existing-user', name: 'Existing user', email: 'existing@example.test',
  emailVerified: null, image: null, role: 'USER', status: 'ACTIVE', tokenVersion: 4,
};
const newUser = { ...currentUser, id: 'new-user', email: 'new@example.test' };
const account: Account = { type: 'oauth', provider: 'google', providerAccountId: 'google-fixture' };
const profile: AdapterUser = { ...newUser, id: 'google-profile-id' };

function fixture() {
  const adapter = {
    getUser: vi.fn().mockResolvedValue(currentUser),
    getUserByAccount: vi.fn().mockResolvedValue(null),
    getUserByEmail: vi.fn().mockResolvedValue(null),
    createUser: vi.fn().mockResolvedValue(newUser),
    linkAccount: vi.fn().mockResolvedValue(undefined),
  } satisfies Adapter;
  const options: CallbackParameters['options'] = {
    adapter,
    jwt: { secret, maxAge: 3600, encode, decode: authOptions.jwt?.decode ?? decode },
    session: { strategy: 'jwt', maxAge: 3600, generateSessionToken: () => 'unused' },
    events: {}, provider: { id: 'google' },
  };
  return { adapter, options };
}

function sessionCookie(tokenVersion = currentUser.tokenVersion) {
  return encode({ secret, token: {
    id: currentUser.id, sub: currentUser.id, tokenVersion,
    role: currentUser.role, status: currentUser.status,
  } });
}

describe('locked NextAuth Google callback account association', () => {
  beforeEach(() => {
    database.findUnique.mockReset().mockResolvedValue(currentUser);
  });

  it('creates and links a new Google user without an existing session', async () => {
    const { adapter, options } = fixture();
    const result = await callbackHandler({ profile, account, options });
    expect(result).toMatchObject({ user: newUser, isNewUser: true });
    expect(adapter.linkAccount).toHaveBeenCalledWith({ ...account, userId: newUser.id });
  });

  it('returns the same application user for an already linked Google account', async () => {
    const { adapter, options } = fixture();
    adapter.getUserByAccount.mockResolvedValue(currentUser);
    const result = await callbackHandler({ profile, account, options });
    expect(result.user.id).toBe(currentUser.id);
    expect(adapter.createUser).not.toHaveBeenCalled();
    expect(adapter.linkAccount).not.toHaveBeenCalled();
  });

  it('rejects an email collision without automatically linking accounts', async () => {
    const { adapter, options } = fixture();
    adapter.getUserByEmail.mockResolvedValue(currentUser);
    await expect(callbackHandler({ profile, account, options }))
      .rejects.toThrow('Another account already exists with the same e-mail address');
    expect(adapter.createUser).not.toHaveBeenCalled();
    expect(adapter.linkAccount).not.toHaveBeenCalled();
  });

  it('retains intentional account linking for a current active session', async () => {
    const { adapter, options } = fixture();
    const result = await callbackHandler({ profile, account, options, sessionToken: await sessionCookie() });
    expect(result.user.id).toBe(currentUser.id);
    expect(adapter.linkAccount).toHaveBeenCalledWith({ ...account, userId: currentUser.id });
    expect(adapter.createUser).not.toHaveBeenCalled();
  });

  it('does not attach an unlinked Google account to a revoked session user', async () => {
    const { adapter, options } = fixture();
    const result = await callbackHandler({ profile, account, options, sessionToken: await sessionCookie(3) });
    expect(result.user.id).toBe(newUser.id);
    expect(adapter.getUser).not.toHaveBeenCalled();
    expect(adapter.linkAccount).toHaveBeenCalledWith({ ...account, userId: newUser.id });
  });

  it('recovers the same linked Google user with a fresh version after a revoked cookie', async () => {
    const { adapter, options } = fixture();
    adapter.getUserByAccount.mockResolvedValue(currentUser);
    const result = await callbackHandler({ profile, account, options, sessionToken: await sessionCookie(3) });
    expect(result.user.id).toBe(currentUser.id);
    expect(adapter.getUser).not.toHaveBeenCalled();
    expect(adapter.createUser).not.toHaveBeenCalled();
    expect(adapter.linkAccount).not.toHaveBeenCalled();
    const jwtCallback = authOptions.callbacks?.jwt;
    if (!jwtCallback) throw new Error('JWT callback is required');
    const freshToken = await jwtCallback({ token: { sub: result.user.id }, user: result.user } as never);
    expect(freshToken.tokenVersion).toBe(currentUser.tokenVersion);
    const freshCookie = await encode({ secret, token: freshToken });
    await expect(options.jwt.decode({ secret, token: freshCookie })).resolves.toMatchObject({
      id: currentUser.id, sub: currentUser.id, tokenVersion: currentUser.tokenVersion,
    });
  });

  it('rejects linking a different users already-associated Google account to an active session', async () => {
    const { adapter, options } = fixture();
    adapter.getUserByAccount.mockResolvedValue(newUser);
    await expect(callbackHandler({ profile, account, options, sessionToken: await sessionCookie() }))
      .rejects.toThrow('The account is already associated with another user');
    expect(adapter.linkAccount).not.toHaveBeenCalled();
  });
});

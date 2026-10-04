import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { decode, encode, type JWT } from 'next-auth/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({ hasDatabaseUrl: vi.fn(), findUnique: vi.fn() }));
vi.mock('./prisma', () => ({
  hasDatabaseUrl: database.hasDatabaseUrl,
  getPrismaClient: () => ({ user: { findUnique: database.findUnique } }),
}));
vi.mock('@next-auth/prisma-adapter', () => ({ PrismaAdapter: () => undefined }));

import { authOptions } from './options';

// JOSE uses Node's typed arrays; jsdom supplies a separate Uint8Array realm.
vi.stubGlobal('Uint8Array', Object.getPrototypeOf(Buffer.prototype).constructor);

const secret = randomUUID();
const storedUser = { id: 'user-1', role: 'USER', status: 'ACTIVE', tokenVersion: 4 };
const claims: JWT = { id: storedUser.id, sub: storedUser.id, tokenVersion: 4 };

async function decodeCookie(token: JWT = claims, maxAge = 3600) {
  const cookie = await encode({ secret, token, maxAge });
  return (authOptions.jwt?.decode ?? decode)({ secret, token: cookie });
}

describe('application session validation before NextAuth account linking', () => {
  beforeEach(() => {
    database.hasDatabaseUrl.mockReset().mockReturnValue(true);
    database.findUnique.mockReset().mockResolvedValue(storedUser);
  });

  it('accepts a current active session after default authenticated decryption', async () => {
    await expect(decodeCookie()).resolves.toMatchObject(claims);
    expect(database.findUnique).toHaveBeenCalledWith({
      where: { id: storedUser.id },
      select: { id: true, role: true, status: true, tokenVersion: true },
    });
  });

  it('rejects a stale session without upgrading its issued version', async () => {
    await expect(decodeCookie({ ...claims, tokenVersion: 3 })).resolves.toBeNull();
  });

  it.each(['SUSPENDED', 'DELETED'])('rejects a %s application user', async (status) => {
    database.findUnique.mockResolvedValue({ ...storedUser, status });
    await expect(decodeCookie()).resolves.toBeNull();
  });

  it.each([
    { sub: 'user-1', tokenVersion: 4 },
    { id: 'user-1', tokenVersion: 4 },
    { id: 'user-1', sub: 'different-user', tokenVersion: 4 },
    { id: '', sub: '', tokenVersion: 4 },
    { id: 'user-1', sub: 'user-1' },
    { id: 'user-1', sub: 'user-1', tokenVersion: '4' },
  ])('rejects incomplete or inconsistent identity claims: %j', async (token) => {
    await expect(decodeCookie(token as JWT)).resolves.toBeNull();
    expect(database.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a missing application user', async () => {
    database.findUnique.mockResolvedValue(null);
    await expect(decodeCookie()).resolves.toBeNull();
  });

  it('rejects a mismatched database identity', async () => {
    database.findUnique.mockResolvedValue({ ...storedUser, id: 'different-user' });
    await expect(decodeCookie()).resolves.toBeNull();
  });

  it('rejects a session when database configuration is absent', async () => {
    database.hasDatabaseUrl.mockReturnValue(false);
    await expect(decodeCookie()).resolves.toBeNull();
    expect(database.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a session when the database lookup fails', async () => {
    database.findUnique.mockRejectedValue(new Error('database unavailable'));
    await expect(decodeCookie()).resolves.toBeNull();
  });

  it('preserves authenticated-decryption checks for a wrong key', async () => {
    const cookie = await encode({ secret: randomUUID(), token: claims });
    await expect((authOptions.jwt?.decode ?? decode)({ secret, token: cookie })).resolves.toBeNull();
    expect(database.findUnique).not.toHaveBeenCalled();
  });

  it('preserves the default expiry check', async () => {
    await expect(decodeCookie(claims, -60)).resolves.toBeNull();
    expect(database.findUnique).not.toHaveBeenCalled();
  });

  it('returns no session for an absent cookie', async () => {
    await expect((authOptions.jwt?.decode ?? decode)({ secret })).resolves.toBeNull();
    expect(database.findUnique).not.toHaveBeenCalled();
  });
});

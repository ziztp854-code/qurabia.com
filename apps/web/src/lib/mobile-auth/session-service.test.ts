import { describe, expect, it, vi } from 'vitest';
import {
  createMobileSession,
  revokeMobileSessionWithPushDevice,
  rotateMobileSession,
} from './session-service';
import { hashMobileRefreshToken } from './tokens';

const signingFixture = 'a-secure-test-secret-that-is-long-enough';
const user = {
  id: 'user-1',
  name: 'مها',
  email: 'maha@example.com',
  image: null,
  role: 'USER',
  status: 'ACTIVE',
  tokenVersion: 2,
};

describe('mobile session service', () => {
  it('persists a refresh hash and returns the raw token only to the caller', async () => {
    const created: Array<{
      tokenHash: string;
      userId: string;
      expiresAt: Date;
      mobileInstallationId?: string;
      mobileInstallationSecretHash?: string;
    }> = [];
    const repository = {
      create: async (input: (typeof created)[number]) => {
        created.push(input);
        return { id: 'session-1' };
      },
      find: async () => null,
      rotate: async () => false,
      revoke: async () => undefined,
    };

    const session = await createMobileSession(repository, signingFixture, user, 1_800_000_000_000);

    expect(created).toHaveLength(1);
    expect(created[0]?.tokenHash).toBe(hashMobileRefreshToken(session.refreshToken));
    expect(created[0]?.tokenHash).not.toContain(session.refreshToken);
    expect(session.sessionId).toBe('session-1');
    expect(session.user).toEqual({ id: user.id, name: user.name, email: user.email, image: null });
  });

  it('stores only the installation secret hash on a newly issued mobile session', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'session-1' });
    const installation = {
      installationId: '11111111-1111-4111-8111-111111111111',
      installationSecret: 'a'.repeat(64),
    };
    const repository = {
      create,
      find: async () => null,
      rotate: async () => false,
      revoke: async () => undefined,
    };

    await createMobileSession(repository, signingFixture, user, 1_800_000_000_000, installation);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        mobileInstallationId: installation.installationId,
        mobileInstallationSecretHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(JSON.stringify(create.mock.calls)).not.toContain(installation.installationSecret);
  });

  it('rotates once and rejects replay of the consumed refresh token', async () => {
    const now = 1_800_000_000_000;
    const initialToken = `m1.2.${'a'.repeat(43)}`;
    let storedHash = hashMobileRefreshToken(initialToken);
    const repository = {
      create: async () => ({ id: 'session-1' }),
      find: async (tokenHash: string) =>
        tokenHash === storedHash
          ? {
              id: 'session-1',
              tokenHash: storedHash,
              expiresAt: new Date(now + 60_000),
              mobileInstallationId: null,
              user,
            }
          : null,
      rotate: async (_id: string, expectedHash: string, replacementHash: string) => {
        if (storedHash !== expectedHash) return false;
        storedHash = replacementHash;
        return true;
      },
      revoke: async () => undefined,
    };

    const first = await rotateMobileSession(repository, signingFixture, initialToken, now);
    const replay = await rotateMobileSession(repository, signingFixture, initialToken, now);

    expect(first?.refreshToken).toBeTruthy();
    expect(replay).toBeNull();
  });

  it('rejects refresh tokens issued before the user token version changed', async () => {
    const now = 1_800_000_000_000;
    const staleToken = `m1.1.${'b'.repeat(43)}`;
    const repository = {
      create: async () => ({ id: 'session-1' }),
      find: async () => ({
        id: 'session-1',
        tokenHash: hashMobileRefreshToken(staleToken),
        expiresAt: new Date(now + 60_000),
        mobileInstallationId: null,
        user,
      }),
      rotate: async () => true,
      revoke: async () => undefined,
    };

    expect(await rotateMobileSession(repository, signingFixture, staleToken, now)).toBeNull();
  });

  it('hashes the refresh token before atomically revoking a session and owned push token', async () => {
    const refreshToken = `m1.2.${'c'.repeat(43)}`;
    const cleanup = {
      sessionId: 'session-1',
      expoPushToken: `ExponentPushToken[${'d'.repeat(32)}]`,
      installationId: '11111111-1111-4111-8111-111111111111',
      installationSecret: 'a'.repeat(64),
      registrationRevision: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    };
    const revokeWithPushDevice = vi.fn().mockResolvedValue(true);

    await expect(
      revokeMobileSessionWithPushDevice(
        { revoke: vi.fn(), revokeWithPushDevice },
        refreshToken,
        cleanup,
      ),
    ).resolves.toBe(true);
    expect(revokeWithPushDevice).toHaveBeenCalledWith(
      hashMobileRefreshToken(refreshToken),
      cleanup,
    );
  });
});

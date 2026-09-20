import { describe, expect, it } from 'vitest';
import {
  createMobileAccessToken,
  createMobileRefreshToken,
  hashMobileRefreshToken,
  verifyMobileAccessToken,
} from './tokens';

const signingFixture = 'a-secure-test-secret-that-is-long-enough';

describe('mobile auth tokens', () => {
  it('issues a short-lived access token whose claims can be verified', () => {
    const issuedAt = 1_800_000_000_000;
    const token = createMobileAccessToken(
      signingFixture,
      { userId: 'user-1', role: 'USER', tokenVersion: 3 },
      issuedAt,
    );

    expect(verifyMobileAccessToken(signingFixture, token, issuedAt + 60_000)).toEqual({
      userId: 'user-1',
      role: 'USER',
      tokenVersion: 3,
      expiresAt: issuedAt + 15 * 60_000,
    });
  });

  it('rejects a tampered or expired access token', () => {
    const issuedAt = 1_800_000_000_000;
    const token = createMobileAccessToken(
      signingFixture,
      { userId: 'user-1', role: 'USER', tokenVersion: 0 },
      issuedAt,
    );

    expect(verifyMobileAccessToken(signingFixture, `${token}x`, issuedAt + 1)).toBeNull();
    expect(verifyMobileAccessToken(signingFixture, token, issuedAt + 15 * 60_000)).toBeNull();
  });

  it('stores only a namespaced hash of the opaque refresh token', () => {
    const refreshToken = createMobileRefreshToken(4);
    const stored = hashMobileRefreshToken(refreshToken);

    expect(refreshToken).toMatch(/^m1\.4\.[A-Za-z0-9_-]{40,}$/);
    expect(stored).toMatch(/^mobile:v1:[a-f0-9]{64}$/);
    expect(stored).not.toContain(refreshToken);
  });
});

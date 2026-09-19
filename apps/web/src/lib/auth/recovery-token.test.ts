import { describe, expect, it } from 'vitest';
import { createRecoveryToken, hashRecoveryToken } from './recovery-token';

describe('password recovery tokens', () => {
  it('stores only a deterministic hash of a random raw token', () => {
    const rawToken = createRecoveryToken();
    const hashedToken = hashRecoveryToken(rawToken);

    expect(rawToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(hashedToken).toMatch(/^[a-f0-9]{64}$/);
    expect(hashedToken).not.toContain(rawToken);
    expect(hashRecoveryToken(rawToken)).toBe(hashedToken);
  });
});

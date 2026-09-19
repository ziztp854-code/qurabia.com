import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('hashes and verifies passwords without storing plaintext', async () => {
    const hash = await hashPassword('StrongPass123');

    expect(hash).toMatch(/^scrypt\$/);
    expect(hash).not.toContain('StrongPass123');
    await expect(verifyPassword('StrongPass123', hash)).resolves.toBe(true);
    await expect(verifyPassword('WrongPass123', hash)).resolves.toBe(false);
  });
});

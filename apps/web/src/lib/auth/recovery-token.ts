import { createHash, randomBytes } from 'node:crypto';

export function createRecoveryToken() {
  return randomBytes(32).toString('base64url');
}

export function hashRecoveryToken(rawToken: string) {
  return createHash('sha256').update(rawToken).digest('hex');
}

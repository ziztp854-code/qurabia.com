import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const installationIdSchema = z.string().uuid();
export const installationSecretSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const registrationRevisionSchema = z.string().uuid();

export type InstallationCapability = {
  installationId: string;
  installationSecret: string;
};

export function hashInstallationSecret(secret: string) {
  return createHash('sha256').update(installationSecretSchema.parse(secret)).digest('hex');
}

export function installationSecretMatches(secret: string, expectedHash: string | null) {
  if (!expectedHash || !/^[a-f0-9]{64}$/.test(expectedHash)) return false;
  return installationSecretHashMatches(hashInstallationSecret(secret), expectedHash);
}

export function installationSecretHashMatches(actualHash: string, expectedHash: string | null) {
  if (!expectedHash || !/^[a-f0-9]{64}$/.test(actualHash) || !/^[a-f0-9]{64}$/.test(expectedHash)) {
    return false;
  }
  const actual = Buffer.from(actualHash, 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

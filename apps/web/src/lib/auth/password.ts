import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const keyLength = 64;
const params = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function deriveKey(password: string, salt: string, options = params) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('base64url');
  const derived = await deriveKey(password, salt);
  return `scrypt$${params.N}$${params.r}$${params.p}$${salt}$${derived.toString('base64url')}`;
}

export async function verifyPassword(password: string, storedHash?: string | null) {
  if (!storedHash) {
    await deriveKey(password, 'tahaddi-missing-user');
    return false;
  }

  const [scheme, n, r, p, salt, hash] = storedHash.split('$');
  if (scheme !== 'scrypt' || !n || !r || !p || !salt || !hash) {
    await deriveKey(password, 'tahaddi-invalid-hash');
    return false;
  }

  const derived = await deriveKey(password, salt, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });
  const stored = Buffer.from(hash, 'base64url');
  return stored.length === derived.length && timingSafeEqual(stored, derived);
}

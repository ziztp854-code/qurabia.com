import { Client } from 'pg';
import { scrypt, timingSafeEqual } from 'node:crypto';

const keyLength = 64;

function deriveKey(password, salt, options) {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

async function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  const [scheme, n, r, p, salt, hash] = storedHash.split('$');
  if (scheme !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  const derived = await deriveKey(password, salt, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });
  const stored = Buffer.from(hash, 'base64url');
  return stored.length === derived.length && timingSafeEqual(stored, derived);
}

const email = process.env.VERIFY_USER_EMAIL;
const password = process.env.VERIFY_USER_PASSWORD;
if (!email || !password) {
  console.error('Set VERIFY_USER_EMAIL and VERIFY_USER_PASSWORD env vars');
  process.exit(1);
}

const client = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'postgres',
  database: 'tahaddi',
});
await client.connect();
try {
  const r = await client.query(
    `SELECT id, email, name, role, status, "passwordHash" FROM "User" WHERE email = $1`,
    [email],
  );
  if (r.rowCount === 0) {
    console.log('User not found');
    process.exit(1);
  }
  const u = r.rows[0];
  const valid = await verifyPassword(password, u.passwordHash);
  console.log(`User: ${u.email}`);
  console.log(`  name:   ${u.name}`);
  console.log(`  role:   ${u.role}`);
  console.log(`  status: ${u.status}`);
  console.log(`  password valid: ${valid}`);
} finally {
  await client.end();
}

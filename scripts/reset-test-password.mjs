import { randomBytes, scrypt } from 'node:crypto';
import { Client } from 'pg';

const keyLength = 64;
const params = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function deriveKey(password, salt, options = params) {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString('base64url');
  const derived = await deriveKey(password, salt);
  return `scrypt$${params.N}$${params.r}$${params.p}$${salt}$${derived.toString('base64url')}`;
}

// Reads target email and new password from environment variables to avoid
// leaking credentials into version control. Run with:
//   RESET_USER_EMAIL=... RESET_USER_PASSWORD=... \
//     node scripts/reset-test-password.mjs
async function main() {
  const email = process.env.RESET_USER_EMAIL;
  const newPassword = process.env.RESET_USER_PASSWORD;
  if (!email || !newPassword) {
    console.error(
      'Set RESET_USER_EMAIL and RESET_USER_PASSWORD env vars before running.',
    );
    process.exit(1);
  }
  const hashed = await hashPassword(newPassword);
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'tahaddi',
  });
  await client.connect();
  const result = await client.query(
    `UPDATE "User" SET "passwordHash" = $1 WHERE email = $2 RETURNING id, email`,
    [hashed, email],
  );
  console.log(`Updated ${result.rowCount} user(s):`, result.rows);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

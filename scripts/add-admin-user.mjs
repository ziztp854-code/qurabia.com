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

// Reads admin user details from environment variables to avoid leaking
// credentials into version control. Use the wrapper shell command or
// inline env vars when running locally, e.g.:
//   ADMIN_USER_EMAIL=... ADMIN_USER_PASSWORD=... node scripts/add-admin-user.mjs
const adminEmail = process.env.ADMIN_USER_EMAIL;
const adminPassword = process.env.ADMIN_USER_PASSWORD;
const adminName = process.env.ADMIN_USER_NAME ?? 'Admin';
const adminRole = (process.env.ADMIN_USER_ROLE ?? 'ADMIN').toUpperCase();

if (!adminEmail || !adminPassword) {
  console.error(
    'Set ADMIN_USER_EMAIL and ADMIN_USER_PASSWORD environment variables.',
  );
  process.exit(1);
}

const USERS = [
  {
    email: adminEmail,
    name: adminName,
    password: adminPassword,
    role: adminRole,
    status: 'ACTIVE',
  },
];

async function main() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'tahaddi',
  });
  await client.connect();
  try {
    for (const u of USERS) {
      const hashed = await hashPassword(u.password);
      const result = await client.query(
        `INSERT INTO "User" (id, email, name, "passwordHash", role, status, "tokenVersion", "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4::"UserRole", $5::"UserStatus", 0, NOW(), NOW())
         ON CONFLICT (email) DO UPDATE
           SET name = EXCLUDED.name,
               "passwordHash" = EXCLUDED."passwordHash",
               role = EXCLUDED.role,
               status = EXCLUDED.status,
               "updatedAt" = NOW()
         RETURNING id, email, name, role, status`,
        [u.email, u.name, hashed, u.role, u.status],
      );
      console.log(`Upserted:`, result.rows[0]);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

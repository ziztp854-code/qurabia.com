import { defineConfig } from 'prisma/config';

if (process.env.VERCEL_ENV !== 'production' || process.env.VOICE_SCHEMA_DEPLOY !== '1')
  throw new Error('Voice production migration requires its explicit deployment context.');
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) throw new Error('The production database is not configured.');

// Deliberately do not load .env files or substitute a local/example database.
export default defineConfig({
  schema: '../prisma/schema.prisma',
  migrations: { path: '../prisma/migrations' },
  datasource: { url },
});

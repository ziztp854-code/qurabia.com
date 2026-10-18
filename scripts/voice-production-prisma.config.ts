import { defineConfig } from 'prisma/config';
import { resolveMigrationUrl } from './deploy-migrations.mjs';

if (process.env.VERCEL_ENV !== 'production' || process.env.VOICE_SCHEMA_DEPLOY !== '1')
  throw new Error('Voice production migration requires its explicit deployment context.');
if (!process.env.DIRECT_URL && !process.env.DATABASE_URL)
  throw new Error('The production database is not configured.');
const url = resolveMigrationUrl(process.env);

// Deliberately do not load .env files or substitute a local/example database.
export default defineConfig({
  schema: '../prisma/schema.prisma',
  migrations: { path: '../prisma/migrations' },
  datasource: { url },
});

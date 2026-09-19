import { existsSync } from 'node:fs';
import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

config({ path: '.env', quiet: true });
config({ path: '.env.local', override: true, quiet: true });
if (!existsSync('.env') && !existsSync('.env.local')) {
  config({ path: '.env.example', quiet: true });
}

const datasourceUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const isGenerateCommand = process.argv.includes('generate');
const generateOnlyDatasourceUrl =
  'postgresql://postgres:postgres@localhost:5432/tahaddi?schema=public';

if (!datasourceUrl && !isGenerateCommand) {
  throw new Error('DIRECT_URL or DATABASE_URL is required for Prisma CLI commands.');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: datasourceUrl ?? generateOnlyDatasourceUrl,
  },
});

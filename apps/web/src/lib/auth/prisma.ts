import { createPrismaClient } from '@tahaddi/database';

type PrismaClientInstance = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as typeof globalThis & {
  tahaddiPrisma?: PrismaClientInstance;
};

export function hasDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL);
}

export function getPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for Tahaddi authentication.');
  }

  if (!globalForPrisma.tahaddiPrisma) {
    globalForPrisma.tahaddiPrisma = createPrismaClient(connectionString);
  }

  return globalForPrisma.tahaddiPrisma;
}

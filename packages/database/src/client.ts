import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type PrismaClient as PrismaClientInstance } from './generated/client';

export { Prisma, UserRole, UserStatus } from './generated/client';

export function createPrismaClient(connectionString: string): PrismaClientInstance {
  const adapter = new PrismaPg({ connectionString, max: 5 });
  return new PrismaClient({ adapter });
}

export type DatabaseClient = ReturnType<typeof createPrismaClient>;

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DatabaseClient } from '@tahaddi/database';

const databaseUrl = process.env.KINGDOMS_TEST_DATABASE_URL;
const migrationPath = resolve(
  process.cwd(),
  '../../prisma/migrations/20260930000000_kingdoms_commanders/migration.sql',
);

describe.skipIf(!databaseUrl)('Commander additive state migration', () => {
  let db: DatabaseClient;
  beforeAll(async () => {
    const target = new URL(databaseUrl!);
    if (
      !['postgres:', 'postgresql:'].includes(target.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
      !/^\/kingdoms_test(?:_[a-zA-Z0-9_-]+)?$/.test(target.pathname) ||
      target.search ||
      target.hash
    )
      throw new Error(
        'Commander migration tests require an isolated local kingdoms_test database.',
      );
    const { createPrismaClient } = await import('@tahaddi/database');
    db = createPrismaClient(databaseUrl!);
    await db.$connect();
  });
  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  it('backfills only missing commanders and preserves existing players, armies, villages and timers', async () => {
    const sql = readFileSync(migrationPath, 'utf8');
    const legacy = {
      version: 1,
      players: { alice: { id: 'alice', score: 90 } },
      villages: { capital: { ownerId: 'alice', resources: { gold: 150 }, troops: { guard: 10 } } },
      movements: [{ id: 'army1', troops: { guard: 4 }, arrivesAt: 1000 }],
      config: { secondsPerTile: 60 },
      reports: [{ id: 'report1' }],
    };
    const current = {
      ...legacy,
      commanders: { c1: { id: 'c1', playerId: 'alice', experience: 100 } },
    };
    await db.$transaction(async (tx) => {
      // A transaction-local temporary table shadows the real aggregate table.
      // The migration is exercised unchanged without rewriting any persisted world.
      await tx.$executeRawUnsafe(`CREATE TEMP TABLE "KingdomWorld" (
        id text PRIMARY KEY, state jsonb NOT NULL, revision integer NOT NULL,
        "updatedAt" timestamp NOT NULL, "nextEventAt" timestamp
      ) ON COMMIT DROP`);
      const timer = new Date('2030-01-01T00:00:00Z');
      const updated = new Date('2020-01-01T00:00:00Z');
      await tx.$executeRaw`INSERT INTO "KingdomWorld" VALUES
        ('legacy', ${JSON.stringify(legacy)}::jsonb, 5, ${updated}, ${timer}),
        ('current', ${JSON.stringify(current)}::jsonb, 7, ${updated}, ${timer})`;
      await tx.$executeRawUnsafe(sql);
      await tx.$executeRawUnsafe(sql);
      const rows = await tx.$queryRaw<
        { id: string; state: unknown; revision: number; nextEventAt: Date; updatedAt: Date }[]
      >`
        SELECT id, state, revision, "nextEventAt", "updatedAt" FROM "KingdomWorld" ORDER BY id`;
      expect(rows.find((row) => row.id === 'legacy')).toMatchObject({
        state: { ...legacy, commanders: {} },
        revision: 6,
        nextEventAt: timer,
      });
      expect(rows.find((row) => row.id === 'legacy')!.updatedAt.getTime()).toBeGreaterThan(
        updated.getTime(),
      );
      expect(rows.find((row) => row.id === 'current')).toEqual({
        id: 'current',
        state: current,
        revision: 7,
        nextEventAt: timer,
        updatedAt: updated,
      });
    });
  });
});

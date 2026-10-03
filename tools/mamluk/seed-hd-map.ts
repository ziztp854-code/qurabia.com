import { createPrismaClient, type Prisma } from '@tahaddi/database';
import { hashPassword } from '../../apps/web/src/lib/auth/password';
import { createWorld, executeCommand } from '../../apps/web/src/lib/kingdoms/engine';
import { refreshProgression, progressionConfig } from '../../apps/web/src/lib/kingdoms/progression';
import { provisionVillageGeography } from '../../apps/web/src/lib/mamluk-map/village-geography';
import { buildVillageTerritories } from '../../apps/web/src/lib/mamluk-map/village-territories';
import { storeMapRecord } from '../../apps/web/src/lib/mamluk-map/storage';
import { createCity } from '@mamluk/world-map-core/server';

// Explicit local fixture only. No DATABASE_URL fallback and no production credentials.
const value = process.env.KINGDOMS_TEST_DATABASE_URL;
if (!value) throw new Error('KINGDOMS_TEST_DATABASE_URL is required.');
const database = new URL(value);
if (
  !['postgres:', 'postgresql:'].includes(database.protocol) ||
  !['127.0.0.1', 'localhost', '[::1]'].includes(database.hostname) ||
  !/^\/kingdoms_test(?:_[a-zA-Z0-9_-]+)?$/.test(database.pathname) ||
  database.search ||
  database.hash
)
  throw new Error('HD map fixtures require an explicitly isolated local kingdoms_test database.');

async function seed() {
  const now = Date.now();
  const owner = 'mamluk-map-local-viewer';
  const enemy = 'mamluk-map-local-opponent';
  const original = executeCommand(
    executeCommand(createWorld(now), owner, { type: 'found', name: 'إمارة القاهرة' }, now),
    enemy,
    { type: 'found', name: 'حملة الجوار' },
    now,
  );
  const templates = Object.values(original.villages);
  const config = progressionConfig(original);
  const levels = [50, 15, 3, 8, 25, 35, 45];
  const names = [
    'حاضرة القاهرة',
    'قرية الواحة',
    'قرية الجوار',
    'وادي النخيل',
    'بلدة المنارة',
    'مدينة السهل',
    'مدينة النصر',
  ];
  const villages = Object.fromEntries(
    levels.map((level, index) => {
      const xp = Array.from({ length: level - 1 }, (_, index) => index + 1).reduce(
        (sum, step) => sum + config.xpStep * step * (1 + Math.floor(step / 10)),
        0,
      );
      const base = templates[index === 2 ? 1 : 0]!;
      const buildings = config.milestones
        .filter((entry) => entry.level <= level)
        .reduce((all, entry) => ({ ...all, ...entry.buildings }), base.buildings);
      const id = `hd-village-${index}`;
      return [
        id,
        {
          ...base,
          id,
          name: names[index]!,
          x: index - 3,
          y: index % 2,
          buildings,
          progression: { ...base.progression!, xp, signature: '' },
        },
      ];
    }),
  );
  const state = {
    ...original,
    villages,
    territories: { '0,0': owner, '1,0': owner, '2,0': owner },
  };
  // Derive level, rank, visual tier and power with the same authoritative engine as production.
  refreshProgression(state, new Map());
  const worldId = 'mamluk-hd-villages-local';
  const provisioned = provisionVillageGeography(worldId, state);
  // Deterministic WGS84 fixture locations near Cairo, independent of game-grid coordinates.
  const cities = provisioned.geography!.cities.map((record, index) =>
    storeMapRecord(
      createCity({
        ...record.value,
        longitude: 31.24967 + index * 0.025,
        latitude: 30.06263 - (index % 2) * 0.025,
        regionId: 'egypt',
      }),
    ),
  );
  const geographicState = {
    ...provisioned,
    geography: {
      ...provisioned.geography!,
      cities,
      territories: buildVillageTerritories(worldId, cities, state.villages),
      omittedVillagePlotIds: [],
    },
  };
  const db = createPrismaClient(value!);
  try {
    const passwordHash = await hashPassword('MamlukMapTestOnly42!');
    await db.$transaction(async (tx) => {
      await tx.user.upsert({
        where: { id: owner },
        update: { passwordHash, status: 'ACTIVE' },
        create: {
          id: owner,
          email: 'mamluk-map@example.test',
          name: 'أمير القاهرة — تجربة محلية',
          passwordHash,
          status: 'ACTIVE',
          role: 'USER',
        },
      });
      await tx.user.upsert({
        where: { id: enemy },
        update: {},
        create: { id: enemy, name: 'حملة الجوار المحلية', status: 'ACTIVE', role: 'USER' },
      });
      for (const fixture of [
        {
          id: 'mamluk-hd-villages-local',
          name: 'القرى — تحقق محلي عالي الدقة',
          state: geographicState,
        },
      ]) {
        const json = fixture.state as unknown as Prisma.InputJsonValue;
        await tx.kingdomWorld.upsert({
          where: { id: fixture.id },
          create: { id: fixture.id, name: fixture.name, state: json },
          update: { state: json, revision: { increment: 1 } },
        });
      }
    });
    console.log('Isolated authoritative HD map world and seven village tiers seeded.');
  } finally {
    await db.$disconnect();
  }
}
seed().catch((error) => {
  console.error(
    'HD map fixture seed failed:',
    error instanceof Error ? error.name : 'UnknownError',
  );
  process.exitCode = 1;
});

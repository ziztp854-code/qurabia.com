import { createPrismaClient, type Prisma } from '@tahaddi/database';
import { hashPassword } from '../../apps/web/src/lib/auth/password';
import { createWorld, executeCommand } from '../../apps/web/src/lib/kingdoms/engine';
import { createGeographicCampaign } from '../../apps/web/src/lib/mamluk-map/data';

const value = process.env.KINGDOMS_TEST_DATABASE_URL;
if (!value) throw new Error('KINGDOMS_TEST_DATABASE_URL is required. No production URL fallback.');
const url = new URL(value);
if (
  !['postgres:', 'postgresql:'].includes(url.protocol) ||
  !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
  !/^\/kingdoms_test(?:_[a-zA-Z0-9_-]+)?$/.test(url.pathname) ||
  url.search ||
  url.hash
) {
  throw new Error('Seed is restricted to an isolated local kingdoms_test database.');
}

async function seed() {
  const db = createPrismaClient(value!);
  try {
    const now = Date.now();
    const viewerId = 'mamluk-map-local-viewer';
    const enemyId = 'mamluk-map-local-opponent';
    const worldId = 'mamluk-geographic-local';
    const passwordHash = await hashPassword('MamlukMapTestOnly42!');
    await db.$transaction(async (tx) => {
      await tx.user.upsert({
        where: { id: viewerId },
        update: { passwordHash, status: 'ACTIVE' },
        create: {
          id: viewerId,
          email: 'mamluk-map@example.test',
          name: 'أمير القاهرة — تجربة محلية',
          passwordHash,
          status: 'ACTIVE',
          role: 'USER',
        },
      });
      await tx.user.upsert({
        where: { id: enemyId },
        update: {},
        create: { id: enemyId, name: 'حملة الخصم المحلية', status: 'ACTIVE', role: 'USER' },
      });
      const world = executeCommand(
        executeCommand(createWorld(now), viewerId, { type: 'found', name: 'إمارة القاهرة' }, now),
        enemyId,
        { type: 'found', name: 'الحملة المقابلة' },
        now,
      );
      const state = {
        ...world,
        geography: createGeographicCampaign(worldId, viewerId, enemyId, now),
      };
      await tx.kingdomWorld.upsert({
        where: { id: worldId },
        create: {
          id: worldId,
          name: 'حملة مصر والشام والحجاز',
          state: state as unknown as Prisma.InputJsonValue,
        },
        update: { state: state as unknown as Prisma.InputJsonValue, revision: { increment: 1 } },
      });
    });
    console.log(
      'Local geographic campaign seeded: 12 cities, 3 castles, 3 armies (one hidden), all map layers.',
    );
    console.log('Local fixture login: mamluk-map@example.test / MamlukMapTestOnly42!');
  } finally {
    await db.$disconnect();
  }
}
seed().catch((error) => {
  console.error('Local seed failed:', error instanceof Error ? error.name : 'UnknownError');
  process.exitCode = 1;
});

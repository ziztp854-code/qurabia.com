import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrismaClient } from '@tahaddi/database';
import {
  validateArea,
  validateId,
  validateTime,
} from '../../packages/mamluk-world-map-core/dist/server';
import {
  storeMapRecord,
  type StoredMapRecord,
  type StoredVisibilityGrant,
} from '../../apps/web/src/lib/mamluk-map/storage';

const WORLD_ID = 'mamluk-geographic-local';
const VIEWER_ID = 'mamluk-map-local-viewer';
const backupPath = fileURLToPath(new URL('../../_mamluk/map-vision-backup.json', import.meta.url));
type Action = 'revoke' | 'restore';
interface Backup {
  readonly version: 1;
  readonly worldId: typeof WORLD_ID;
  readonly viewerId: typeof VIEWER_ID;
  readonly grants: readonly StoredMapRecord<StoredVisibilityGrant>[];
}

function localDatabaseUrl(): string {
  const value = process.env.KINGDOMS_TEST_DATABASE_URL;
  if (!value) throw new Error('An explicit isolated test database is required.');
  const url = new URL(value);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    !/^\/kingdoms_test(?:_[a-zA-Z0-9_-]+)?$/.test(url.pathname) ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'Visibility verification is restricted to an isolated local kingdoms_test database.',
    );
  }
  return value;
}

function stringIds(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length > 2000)
    throw new Error('Invalid grant polygon identifiers.');
  value.forEach(validateId);
  return [...new Set(value as string[])];
}

function restorableRecord(input: unknown): StoredMapRecord<StoredVisibilityGrant> {
  const record = input as StoredMapRecord<StoredVisibilityGrant>;
  const region = record?.value?.region;
  if (
    !region ||
    region.worldId !== WORLD_ID ||
    region.recipientPlayerId !== VIEWER_ID ||
    !['watchtower', 'scouting'].includes(region.kind)
  )
    throw new Error('Visibility backup has an invalid scope.');
  validateId(region.id);
  validateTime(region.startsAt);
  validateTime(region.expiresAt);
  if (region.expiresAt <= region.startsAt)
    throw new Error('Visibility backup has an invalid validity period.');
  validateArea(region.geometry);
  return storeMapRecord(
    {
      region: {
        id: region.id,
        worldId: WORLD_ID,
        recipientPlayerId: VIEWER_ID,
        kind: region.kind,
        startsAt: region.startsAt,
        expiresAt: region.expiresAt,
        geometry: region.geometry,
      },
      visibleTerritoryIds: stringIds(record.value.visibleTerritoryIds),
      visibleSultanateTerritoryIds: stringIds(record.value.visibleSultanateTerritoryIds),
    },
    { west: record.west, south: record.south, east: record.east, north: record.north },
  );
}

function readBackup(): Backup {
  const text = readFileSync(backupPath, 'utf8');
  if (Buffer.byteLength(text) > 1_000_000)
    throw new Error('Visibility backup exceeds its size limit.');
  const input = JSON.parse(text) as Backup;
  if (
    input.version !== 1 ||
    input.worldId !== WORLD_ID ||
    input.viewerId !== VIEWER_ID ||
    !Array.isArray(input.grants) ||
    input.grants.length > 128
  )
    throw new Error('Invalid visibility backup.');
  const grants = input.grants.map(restorableRecord);
  if (new Set(grants.map((grant) => grant.value.region.id)).size !== grants.length)
    throw new Error('Visibility backup contains duplicate grants.');
  return { version: 1, worldId: WORLD_ID, viewerId: VIEWER_ID, grants };
}

function isRevokedGrant(record: StoredMapRecord<StoredVisibilityGrant>): boolean {
  return (
    record.value.region.recipientPlayerId === VIEWER_ID &&
    record.value.region.worldId === WORLD_ID &&
    ['watchtower', 'scouting'].includes(record.value.region.kind)
  );
}

function preserveBackup(grants: readonly StoredMapRecord<StoredVisibilityGrant>[]): void {
  mkdirSync(dirname(backupPath), { recursive: true });
  const backup: Backup = {
    version: 1,
    worldId: WORLD_ID,
    viewerId: VIEWER_ID,
    grants: grants.map(restorableRecord),
  };
  try {
    writeFileSync(backupPath, JSON.stringify(backup), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'EEXIST')
      throw error;
    // Validate existing backups; repeated revoke operations never replace the original grants.
    readBackup();
  }
}

async function verify(action: Action): Promise<void> {
  const db = createPrismaClient(localDatabaseUrl());
  try {
    const result = await db.$transaction(
      async (tx) => {
        const [row] = await tx.$queryRaw<{ revision: number; visibility: unknown }[]>`
        SELECT revision, state->'geography'->'visibility' AS visibility FROM "KingdomWorld"
        WHERE id = ${WORLD_ID} AND state->'geography'->>'version' = '1'
          AND state->'players' ? ${VIEWER_ID}::text FOR UPDATE`;
        if (!row || !Array.isArray(row.visibility) || row.visibility.length > 128)
          throw new Error('Local geographic fixture is unavailable.');
        const existing = row.visibility as StoredMapRecord<StoredVisibilityGrant>[];
        for (const record of existing) {
          if (!record?.value?.region || record.value.region.worldId !== WORLD_ID)
            throw new Error('Local fixture contains invalid visibility scope.');
        }
        const preserved = existing.filter((record) => !isRevokedGrant(record));
        if (action === 'revoke') preserveBackup(existing.filter(isRevokedGrant));
        const next = action === 'revoke' ? preserved : [...preserved, ...readBackup().grants];
        const [updated] = await tx.$queryRaw<{ revision: number }[]>`
        UPDATE "KingdomWorld"
        SET state = jsonb_set(state, '{geography,visibility}', ${JSON.stringify(next)}::jsonb, false),
          revision = revision + 1, "updatedAt" = clock_timestamp()
        WHERE id = ${WORLD_ID} AND revision = ${row.revision} RETURNING revision`;
        if (!updated) throw new Error('Local visibility update did not complete.');
        return updated.revision;
      },
      { isolationLevel: 'ReadCommitted', maxWait: 5000, timeout: 15000 },
    );
    console.log(JSON.stringify({ action, worldId: WORLD_ID, revision: result }));
  } finally {
    await db.$disconnect();
  }
}

const action = process.argv[2];
if (action !== 'revoke' && action !== 'restore') throw new Error('Use revoke or restore.');
verify(action).catch((error) => {
  // Never print connection strings, backup contents, enemy identities or raw database errors.
  console.error(
    'Local visibility verification failed:',
    error instanceof Error ? error.name : 'UnknownError',
  );
  process.exitCode = 1;
});

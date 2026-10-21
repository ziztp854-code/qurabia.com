import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';

const connectionString = process.env.ACCOUNT_NUMBER_TEST_DATABASE_URL;
if (connectionString) {
  const url = new URL(connectionString);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
  assert.equal(url.pathname, '/account_numbers_test');
}
const readMigration = (name) =>
  readFile(new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url), 'utf8');
const base = await readMigration('20261021220000_user_account_numbers');
const migration = await readMigration('20261022010000_reserved_account_number');
const frames = await readMigration('20261022020000_exclusive_profile_frames');
const entrances = await readMigration('20261022030000_exclusive_entrances');
const bindings = [
  ['cmrw9rfv9000204l72z55ai5b', 123456800, 2],
  ['cmupvygjx000204jq4bir1i4x', 123456821, 78],
];
async function fixture(run) {
  const db = new pg.Client({ connectionString });
  const schema = `reserved_ids_${randomUUID().replaceAll('-', '')}`;
  await db.connect();
  try {
    await db.query(`CREATE SCHEMA "${schema}"`);
    await db.query(`SET search_path TO "${schema}"`);
    await db.query(
      `CREATE TABLE "User" (id TEXT PRIMARY KEY, role TEXT NOT NULL DEFAULT 'USER', name TEXT)`,
    );
    await db.query(base);
    await db.query(
      `INSERT INTO "User" (id, role, name) VALUES ('owner', 'OWNER', 'Owner'), ('ordinary', 'USER', 'Unchanged')`,
    );
    await run(db);
  } finally {
    await db.query('ROLLBACK');
    await db.query(`DROP SCHEMA "${schema}" CASCADE`);
    await db.end();
  }
}
async function seedBindings(db) {
  for (const [id, old] of bindings)
    await db.query(
      `INSERT INTO "User" (id, "accountNumber", name, role) VALUES ($1, $2, $1, 'ADMIN')`,
      [id, old],
    );
}

test('reserved IDs on isolated PostgreSQL', { skip: !connectionString }, async (t) => {
  await t.test(
    'changes only the two public numbers, preserves owner, roles, data and internal references',
    async () => {
      await fixture(async (db) => {
        await seedBindings(db);
        await db.query(`CREATE TABLE reference_fixture (user_id TEXT REFERENCES "User"(id))`);
        for (const [id] of bindings)
          await db.query('INSERT INTO reference_fixture VALUES ($1)', [id]);
        const before = (await db.query('SELECT * FROM "User" ORDER BY id')).rows;
        await db.query(migration);
        const after = (await db.query('SELECT * FROM "User" ORDER BY id')).rows;
        assert.deepEqual(
          after,
          before.map((row) => ({
            ...row,
            accountNumber: bindings.find(([id]) => id === row.id)?.[2] ?? row.accountNumber,
          })),
        );
        assert.deepEqual(
          (await db.query('SELECT user_id FROM reference_fixture ORDER BY user_id')).rows.map(
            (r) => r.user_id,
          ),
          bindings.map(([id]) => id).sort(),
        );
        await db.query(migration);
        assert.deepEqual((await db.query('SELECT * FROM "User" ORDER BY id')).rows, after);
      });
    },
  );
  await t.test(
    'prevents reserved ID and internal identity transfer and keeps other numbers immutable',
    async () => {
      await fixture(async (db) => {
        await seedBindings(db);
        await db.query(migration);
        for (const [id, , number] of bindings) {
          await assert.rejects(
            db.query(`INSERT INTO "User" (id, "accountNumber") VALUES ($1, $2)`, [
              `impostor-${number}`,
              number,
            ]),
            /is reserved/,
          );
          await assert.rejects(
            db.query(`UPDATE "User" SET "accountNumber" = $1 WHERE id = 'ordinary'`, [number]),
            /cannot be changed/,
          );
          await assert.rejects(
            db.query(`UPDATE "User" SET "accountNumber" = 333333333 WHERE id = $1`, [id]),
            /cannot be changed/,
          );
          await assert.rejects(
            db.query(`UPDATE "User" SET id = 'replacement' WHERE id = $1`, [id]),
            /cannot be transferred/,
          );
        }
        await db.query(`UPDATE "User" SET name = 'Updated' WHERE id = $1`, [bindings[1][0]]);
        assert.equal(
          (await db.query(`SELECT "accountNumber" FROM "User" WHERE id = $1`, [bindings[1][0]]))
            .rows[0].accountNumber,
          78,
        );
        for (const value of [0, 3, 77, 79])
          await assert.rejects(
            db.query(`INSERT INTO "User" (id, "accountNumber") VALUES ($1, $2)`, [
              `invalid-${value}`,
              value,
            ]),
            /check constraint/,
          );
      });
    },
  );
  await t.test(
    'handles absent reserved accounts and permanently retires both old numbers',
    async () => {
      await fixture(async (db) => {
        const before = (await db.query('SELECT * FROM "User" ORDER BY id')).rows;
        await db.query(migration);
        assert.deepEqual((await db.query('SELECT * FROM "User" ORDER BY id')).rows, before);
        for (const [id, old, number] of bindings) {
          await db.query(`SELECT setval('"User_accountNumber_seq"', $1, false)`, [old]);
          assert.equal(
            (
              await db.query(`INSERT INTO "User" (id) VALUES ($1) RETURNING "accountNumber"`, [
                `new-${number}`,
              ])
            ).rows[0].accountNumber,
            old + 1,
          );
          assert.equal(
            (await db.query(`INSERT INTO "User" (id) VALUES ($1) RETURNING "accountNumber"`, [id]))
              .rows[0].accountNumber,
            number,
          );
        }
      });
    },
  );
  await t.test(
    'keeps owner 1 and reserved bindings correct across existing ownership transitions',
    async () => {
      await fixture(async (db) => {
        await seedBindings(db);
        await db.query(migration);
        await db.query(`UPDATE "User" SET role = 'USER' WHERE id = 'owner'`);
        await db.query(`UPDATE "User" SET role = 'OWNER' WHERE id = $1`, [bindings[0][0]]);
        assert.equal(
          (await db.query(`SELECT "accountNumber" FROM "User" WHERE role = 'OWNER'`)).rows[0]
            .accountNumber,
          1,
        );
        await db.query(`UPDATE "User" SET role = 'USER' WHERE id = $1`, [bindings[0][0]]);
        assert.equal(
          (await db.query(`SELECT "accountNumber" FROM "User" WHERE id = $1`, [bindings[0][0]]))
            .rows[0].accountNumber,
          2,
        );
        await db.query(`UPDATE "User" SET role = 'OWNER' WHERE id = 'owner'`);
      });
    },
  );
  await t.test(
    'equips exclusive frames only for their two owners and preserves existing profile selections',
    async () => {
      await fixture(async (db) => {
        await seedBindings(db);
        await db.query(migration);
        const ownerId = 'cmrw9nc29000004l7a6kkosgy';
        await db.query(`UPDATE "User" SET id = $1 WHERE id = 'owner'`, [ownerId]);
        await db.query(`CREATE TABLE "ProfileCosmetic" (id TEXT PRIMARY KEY, name TEXT, description TEXT, kind TEXT, tier TEXT, token TEXT, "assetUrl" TEXT, free BOOLEAN, "updatedAt" TIMESTAMP);
        CREATE TABLE "UserCosmetic" (id TEXT PRIMARY KEY, "userId" TEXT REFERENCES "User"(id), "cosmeticId" TEXT REFERENCES "ProfileCosmetic"(id), "grantedBy" TEXT);
        CREATE TABLE "Profile" (id TEXT PRIMARY KEY, "userId" TEXT UNIQUE REFERENCES "User"(id), "displayName" TEXT, bio TEXT, appearance JSONB, "updatedAt" TIMESTAMP)`);
        const previous = {
          effectId: 'entrance-gold',
          primaryBadgeId: 'gold-member',
          frameId: 'frame-gold',
        };
        await db.query(
          `INSERT INTO "Profile" (id,"userId","displayName",bio,appearance) VALUES ('existing',$1,'Preserved display name','Preserved bio',$2::jsonb)`,
          [bindings[0][0], JSON.stringify(previous)],
        );
        await db.query(frames);
        const grants = (
          await db.query(`SELECT "userId","cosmeticId" FROM "UserCosmetic" ORDER BY "cosmeticId"`)
        ).rows;
        assert.deepEqual(grants, [
          { userId: bindings[0][0], cosmeticId: 'frame-amira-rose' },
          { userId: ownerId, cosmeticId: 'frame-owner-sapphire' },
        ]);
        const profile = (
          await db.query(`SELECT * FROM "Profile" WHERE "userId"=$1`, [bindings[0][0]])
        ).rows[0];
        assert.equal(profile.displayName, 'Preserved display name');
        assert.equal(profile.bio, 'Preserved bio');
        assert.equal(profile.appearance.frameId, 'frame-amira-rose');
        assert.equal(profile.appearance.effectId, previous.effectId);
        assert.equal(profile.appearance.primaryBadgeId, previous.primaryBadgeId);
        assert.equal(Object.keys(profile.appearance).length, 6);
        assert.equal((await db.query(`SELECT count(*)::int AS n FROM "Profile"`)).rows[0].n, 2);
        await db.query(entrances);
        const equipped = (
          await db.query(`SELECT appearance FROM "Profile" WHERE "userId"=$1`, [bindings[0][0]])
        ).rows[0].appearance;
        assert.equal(equipped.frameId, 'frame-amira-rose');
        assert.equal(equipped.effectId, 'entrance-amira-rose');
        assert.equal(equipped.primaryBadgeId, previous.primaryBadgeId);
        assert.equal(
          (await db.query(`SELECT count(*)::int AS n FROM "UserCosmetic"`)).rows[0].n,
          4,
        );
        for (const cosmetic of [
          'frame-amira-rose',
          'frame-owner-sapphire',
          'entrance-amira-rose',
          'entrance-owner-sapphire',
        ]) {
          await assert.rejects(
            db.query(
              `INSERT INTO "UserCosmetic" (id,"userId","cosmeticId") VALUES ($1,'ordinary',$1)`,
              [cosmetic],
            ),
            /check constraint/,
          );
          await assert.rejects(
            db.query(`UPDATE "ProfileCosmetic" SET free=true WHERE id=$1`, [cosmetic]),
            /check constraint/,
          );
        }
      });
    },
  );
  for (const [, old] of bindings) {
    await t.test(`rolls back both changes when ${old} belongs to another account`, async () => {
      await fixture(async (db) => {
        for (const [id, previous] of bindings)
          await db.query(`INSERT INTO "User" (id, "accountNumber") VALUES ($1, $2)`, [
            previous === old ? 'wrong-identity' : id,
            previous,
          ]);
        const before = (await db.query('SELECT * FROM "User" ORDER BY id')).rows;
        await assert.rejects(db.query(migration), /different account/);
        await db.query('ROLLBACK');
        assert.deepEqual((await db.query('SELECT * FROM "User" ORDER BY id')).rows, before);
        await assert.rejects(
          db.query(`INSERT INTO "User" (id, "accountNumber") VALUES ('short', 78)`),
          /check constraint/,
        );
      });
    });
  }
  await t.test(
    'refuses a mismatched target number instead of renumbering an unexpected identity',
    async () => {
      await fixture(async (db) => {
        await db.query(`INSERT INTO "User" (id) VALUES ($1)`, [bindings[0][0]]);
        await assert.rejects(db.query(migration), /precondition/);
        await db.query('ROLLBACK');
        assert.equal(
          (await db.query(`SELECT "accountNumber" FROM "User" WHERE id = $1`, [bindings[0][0]]))
            .rows[0].accountNumber,
          123456791,
        );
      });
    },
  );
});

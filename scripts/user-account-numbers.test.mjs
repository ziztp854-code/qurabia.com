import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';

const connectionString = process.env.ACCOUNT_NUMBER_TEST_DATABASE_URL;
const migration = await readFile(
  new URL(
    '../prisma/migrations/20261021220000_user_account_numbers/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

// Never run schema fixtures against a shared or production database.
if (connectionString) {
  const url = new URL(connectionString);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
  assert.equal(url.pathname, '/account_numbers_test');
}

async function fixture(run) {
  const db = new pg.Client({ connectionString });
  const schema = `account_ids_${randomUUID().replaceAll('-', '')}`;
  await db.connect();
  try {
    await db.query(`CREATE SCHEMA "${schema}"`);
    await db.query(`SET search_path TO "${schema}"`);
    await db.query(`CREATE TABLE "User" (
      "id" TEXT PRIMARY KEY, "role" TEXT NOT NULL DEFAULT 'USER', "name" TEXT
    )`);
    await run(db, schema);
  } finally {
    await db.query('ROLLBACK');
    await db.query(`DROP SCHEMA "${schema}" CASCADE`);
    await db.end();
  }
}

test('account-number migration on isolated PostgreSQL', { skip: !connectionString }, async (t) => {
  await t.test(
    'backfills all accounts, reserves 1, and preserves internal references',
    async () => {
      await fixture(async (db) => {
        await db.query(`INSERT INTO "User" (id, role) VALUES
        ('existing-owner', 'OWNER'), ('existing-user', 'USER'), ('existing-admin', 'ADMIN')`);
        await db.query(`CREATE TABLE reference_fixture (user_id TEXT REFERENCES "User"(id))`);
        await db.query(`INSERT INTO reference_fixture VALUES ('existing-user')`);
        await db.query(migration);
        const { rows } = await db.query('SELECT * FROM "User" ORDER BY id');
        assert.equal(rows.find((row) => row.id === 'existing-owner').accountNumber, 1);
        const numbers = rows.filter((row) => row.role !== 'OWNER').map((row) => row.accountNumber);
        assert.ok(numbers.every((number) => /^[1-9]\d{8}$/.test(String(number))));
        assert.equal(new Set(numbers).size, numbers.length);
        assert.equal(
          (await db.query('SELECT user_id FROM reference_fixture')).rows[0].user_id,
          'existing-user',
        );
        await db.query(`UPDATE "User" SET name = 'Updated' WHERE id = 'existing-user'`);
        assert.deepEqual(
          (await db.query('SELECT "accountNumber" FROM "User" ORDER BY id')).rows,
          rows.map(({ accountNumber }) => ({ accountNumber })),
        );
      });
    },
  );

  await t.test('generates distinct nine-digit IDs for simultaneous account creation', async () => {
    await fixture(async (db, schema) => {
      await db.query(migration);
      const numbers = await Promise.all(
        Array.from({ length: 12 }, async (_, index) => {
          const client = new pg.Client({ connectionString });
          await client.connect();
          try {
            await client.query(`SET search_path TO "${schema}"`);
            const { rows } = await client.query(
              'INSERT INTO "User" (id) VALUES ($1) RETURNING "accountNumber"',
              [`new-${index}`],
            );
            return rows[0].accountNumber;
          } finally {
            await client.end();
          }
        }),
      );
      assert.equal(new Set(numbers).size, 12);
      assert.ok(numbers.every((number) => /^[1-9]\d{8}$/.test(String(number))));
      assert.equal(Math.min(...numbers), 123456789);
      assert.equal(
        (
          await db.query(
            `INSERT INTO "User" (id, role) VALUES ('new-owner', 'OWNER') RETURNING "accountNumber"`,
          )
        ).rows[0].accountNumber,
        1,
      );
      await assert.rejects(
        db.query(`INSERT INTO "User" (id, role) VALUES ('second-owner', 'OWNER')`),
        /unique constraint/,
      );
    });
  });

  await t.test(
    'prevents renumbering, invalid values, duplicates, and sequence wraparound',
    async () => {
      await fixture(async (db) => {
        await db.query(migration);
        const {
          rows: [user],
        } = await db.query(`INSERT INTO "User" (id) VALUES ('stable') RETURNING "accountNumber"`);
        await assert.rejects(
          db.query(`UPDATE "User" SET "accountNumber" = 555555555 WHERE id = 'stable'`),
          /cannot be changed/,
        );
        await assert.rejects(
          db.query('INSERT INTO "User" (id, "accountNumber") VALUES ($1, $2)', [
            'duplicate',
            user.accountNumber,
          ]),
          /unique constraint/,
        );
        for (const number of [0, 2, 99999999, 1000000000]) {
          await assert.rejects(
            db.query('INSERT INTO "User" (id, "accountNumber") VALUES ($1, $2)', [
              `bad-${number}`,
              number,
            ]),
            /check constraint/,
          );
        }
        await db.query(`SELECT setval('"User_accountNumber_seq"', 999999999, false)`);
        assert.equal(
          (await db.query(`INSERT INTO "User" (id) VALUES ('last') RETURNING "accountNumber"`))
            .rows[0].accountNumber,
          999999999,
        );
        await assert.rejects(
          db.query(`INSERT INTO "User" (id) VALUES ('exhausted')`),
          /maximum value/,
        );
      });
    },
  );

  await t.test('keeps 1 reserved when ownership changes', async () => {
    await fixture(async (db) => {
      await db.query(
        `INSERT INTO "User" (id, role) VALUES ('owner', 'OWNER'), ('successor', 'USER')`,
      );
      await db.query(migration);
      await db.query(`UPDATE "User" SET role = 'USER' WHERE id = 'owner'`);
      await db.query(`UPDATE "User" SET role = 'OWNER' WHERE id = 'successor'`);
      const { rows } = await db.query('SELECT * FROM "User"');
      assert.equal(rows.find((row) => row.id === 'successor').accountNumber, 1);
      assert.match(String(rows.find((row) => row.id === 'owner').accountNumber), /^[1-9]\d{8}$/);
    });
  });

  await t.test('rolls back safely if multiple owners already exist', async () => {
    await fixture(async (db) => {
      await db.query(
        `INSERT INTO "User" (id, role) VALUES ('owner-1', 'OWNER'), ('owner-2', 'OWNER')`,
      );
      await assert.rejects(db.query(migration), /requires a single platform owner/);
      await db.query('ROLLBACK');
      assert.equal((await db.query('SELECT count(*)::int AS count FROM "User"')).rows[0].count, 2);
      await assert.rejects(db.query('SELECT "accountNumber" FROM "User"'), /does not exist/);
    });
  });
});

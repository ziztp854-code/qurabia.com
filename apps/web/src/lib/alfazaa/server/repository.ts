import 'server-only';
import type { DatabaseClient, Prisma } from '@tahaddi/database';
import { getPrismaClient } from '@/lib/auth/prisma';
import {
  advanceState,
  applyCommand,
  createInitialState,
  validateState,
  type AlfazaaState,
} from '../domain';
import { commandRequestSchema } from './schema';
import { AlfazaaHttpError, stableFingerprint } from './http';

export type AlfazaaIdentity = { id: string; tokenVersion: number };
export type AccountView = { state: AlfazaaState; revision: number };
type Tx = Prisma.TransactionClient;
type AccountRow = { userId: string; state: unknown; revision: number };
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

async function account(tx: Tx, identity: AlfazaaIdentity) {
  // A concurrent suspension/token revocation must serialize with this command.
  const [user] = await tx.$queryRaw<{ id: string; status: string; tokenVersion: number }[]>`
    SELECT id, status, "tokenVersion" FROM "User" WHERE id = ${identity.id} FOR SHARE`;
  if (!user || user.status !== 'ACTIVE' || user.tokenVersion !== identity.tokenVersion)
    throw new AlfazaaHttpError(401, 'انتهت صلاحية الجلسة. سجّل الدخول مجددًا.');
  const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
  const now = clock.now.getTime();
  if (!Number.isSafeInteger(now)) throw new Error('Invalid database clock');
  // Native conflict handling also covers simultaneous first visits; do not
  // perform a read-then-create Prisma upsert that can race on an absent row.
  await tx.$executeRaw`INSERT INTO "AlfazaaState" ("userId", state, "updatedAt")
    VALUES (${identity.id}, ${JSON.stringify(createInitialState(now))}::jsonb, clock_timestamp())
    ON CONFLICT ("userId") DO NOTHING`;
  const [row] = await tx.$queryRaw<AccountRow[]>`
    SELECT "userId", state, revision FROM "AlfazaaState" WHERE "userId" = ${identity.id} FOR UPDATE`;
  const state = row && validateState(row.state);
  if (!state || state.revision !== row.revision) throw new Error('Invalid stored Alfazaa state');
  // Read time after acquiring the row lock: a waiting request must not advance
  // from the timestamp captured before the preceding command committed.
  const [lockedClock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
  const lockedNow = lockedClock.now.getTime();
  if (!Number.isSafeInteger(lockedNow)) throw new Error('Invalid database clock');
  return { row, state, now: lockedNow };
}

function transaction<T>(
  identity: AlfazaaIdentity,
  work: (tx: Tx, value: Awaited<ReturnType<typeof account>>) => Promise<T>,
  db: DatabaseClient,
) {
  return db.$transaction(async (tx) => work(tx, await account(tx, identity)), {
    isolationLevel: 'ReadCommitted',
    maxWait: 5_000,
    timeout: 10_000,
  });
}

export function readAlfazaa(
  identity: AlfazaaIdentity,
  db: DatabaseClient = getPrismaClient(),
): Promise<AccountView> {
  return transaction(
    identity,
    async (_tx, { row, state, now }) => ({
      state: advanceState(state, now),
      revision: row.revision,
    }),
    db,
  );
}

export async function commandAlfazaa(
  identity: AlfazaaIdentity,
  raw: unknown,
  db: DatabaseClient = getPrismaClient(),
): Promise<AccountView> {
  const request = commandRequestSchema.parse(raw);
  const fingerprint = stableFingerprint({
    expectedRevision: request.expectedRevision,
    command: request.command,
  });
  return transaction(
    identity,
    async (tx, { row, state, now }) => {
      const receipt = await tx.alfazaaCommand.findUnique({
        where: { userId_key: { userId: identity.id, key: request.idempotencyKey } },
      });
      if (receipt) {
        if (receipt.fingerprint !== fingerprint)
          throw new AlfazaaHttpError(409, 'مفتاح الطلب مستخدم لأمر مختلف.');
        return receipt.result as unknown as AccountView;
      }
      if (request.expectedRevision !== row.revision)
        throw new AlfazaaHttpError(409, 'تغيّر التقدّم في نافذة أخرى. حدّث الحالة وحاول مجددًا.');
      const result = applyCommand(state, request.command, now);
      if (!result.ok) throw new AlfazaaHttpError(409, result.message);
      const next = { ...result.state, revision: row.revision + 1 };
      const view: AccountView = { state: next, revision: next.revision };
      await tx.alfazaaState.update({
        where: { userId: identity.id },
        data: { state: json(next), revision: next.revision },
      });
      await tx.alfazaaCommand.create({
        data: {
          userId: identity.id,
          key: request.idempotencyKey,
          fingerprint,
          result: json(view),
        },
      });
      // Bound full-state receipts to 128 per account, including high-frequency
      // training ticks. Revisions order commits even when timestamps tie. An
      // expired key cannot repeat a spend: its old expectedRevision is rejected.
      await tx.$executeRaw`DELETE FROM "AlfazaaCommand"
      WHERE "userId" = ${identity.id} AND "key" IN (
        SELECT "key" FROM "AlfazaaCommand" WHERE "userId" = ${identity.id}
        ORDER BY (result->>'revision')::bigint DESC OFFSET 128
      )`;
      return view;
    },
    db,
  );
}

import 'server-only';
import type { DatabaseClient, Prisma } from '@tahaddi/database';
import { advanceWorld } from './engine';
import { kingdomTransaction, nextDeadline, type KingdomIdentity } from './repository';
import { KingdomsHttpError, stableFingerprint } from './http';
import {
  applyWorkshopAction,
  projectWorkshop,
  settleWorkshop,
  workshopActionSchema,
  workshopReadSchema,
  type WorkshopVillage,
} from './siege-workshop';
import type { KingdomsWorld } from './types';
import { provisionVillageGeography } from '../mamluk-map/village-geography';

type WorldRow = { id: string; state: unknown; revision: number; paused: boolean };
type Tx = Prisma.TransactionClient;

async function lockedWorkshop(tx: Tx, worldId: string, villageId: string, actor: KingdomIdentity) {
  const [row] = await tx.$queryRaw<
    WorldRow[]
  >`SELECT id, state, revision, paused FROM "KingdomWorld" WHERE id = ${worldId} FOR UPDATE`;
  const user = await tx.user.findUnique({
    where: { id: actor.id },
    select: { status: true, tokenVersion: true },
  });
  if (!user || user.status !== 'ACTIVE' || user.tokenVersion !== actor.tokenVersion)
    throw new KingdomsHttpError(401, 'الجلسة غير صالحة.');
  if (!row) throw new KingdomsHttpError(404, 'العالم غير موجود.');
  const original = row.state as KingdomsWorld;
  const village = Object.hasOwn(original.villages, villageId)
    ? original.villages[villageId]
    : undefined;
  if (!village || village.ownerId !== actor.id)
    throw new KingdomsHttpError(403, 'هذه الورشة ليست ضمن قريتك.');
  const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
  const now = Math.max(original.updatedAt, clock.now.getTime());
  const state = row.paused ? original : advanceWorld(original, now);
  const at = row.paused ? original.updatedAt : Math.min(now, state.season.endsAt);
  const selected = state.villages[villageId] as WorkshopVillage;
  if (!selected || selected.ownerId !== actor.id)
    throw new KingdomsHttpError(403, 'هذه الورشة ليست ضمن قريتك.');
  const settled = row.paused ? selected : settleWorkshop(selected, at);
  const current = { ...state, villages: { ...state.villages, [villageId]: settled } };
  return { row, state: current, village: settled, now };
}

async function persist(tx: Tx, row: WorldRow, state: KingdomsWorld) {
  const ordinary = nextDeadline(state);
  const workshopDates = Object.values(state.villages).flatMap(
    (village) => (village as WorkshopVillage).siegeWorkshop?.queue.map((item) => item.endsAt) ?? [],
  );
  const next =
    ordinary && !row.paused ? new Date(Math.min(ordinary.getTime(), ...workshopDates)) : ordinary;
  return tx.kingdomWorld.update({
    where: { id: row.id },
    data: {
      state: JSON.parse(JSON.stringify(provisionVillageGeography(row.id, state))) as Prisma.InputJsonValue,
      revision: { increment: 1 },
      nextEventAt: next,
    },
  });
}

export async function readSiegeWorkshop(
  worldId: string,
  villageId: string,
  identity: KingdomIdentity,
  db?: DatabaseClient,
) {
  workshopReadSchema.parse({ worldId, villageId });
  const actor = Object.freeze({ ...identity });
  return kingdomTransaction(async (tx) => {
    const { row, state, village, now } = await lockedWorkshop(tx, worldId, villageId, actor);
    const changed = JSON.stringify(state) !== JSON.stringify(row.state);
    const revision = changed ? (await persist(tx, row, state)).revision : row.revision;
    return {
      worldId,
      villageId,
      playerId: actor.id,
      revision,
      paused: row.paused,
      ended: state.season.status === 'ended',
      ...projectWorkshop(village, now),
    };
  }, db);
}

export async function commandSiegeWorkshop(
  worldId: string,
  villageId: string,
  identity: KingdomIdentity,
  input: unknown,
  db?: DatabaseClient,
) {
  workshopReadSchema.parse({ worldId, villageId });
  const action = workshopActionSchema.parse(input);
  const actor = Object.freeze({ ...identity });
  return kingdomTransaction(async (tx) => {
    const { row, state, village, now } = await lockedWorkshop(tx, worldId, villageId, actor);
    const key = `siege:${action.key}`;
    const fingerprint = stableFingerprint({ villageId, action });
    const previous = await tx.kingdomCommand.findUnique({
      where: { worldId_actorId_key: { worldId, actorId: actor.id, key } },
    });
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        throw new KingdomsHttpError(409, 'مفتاح الطلب مستخدم لأمر مختلف.');
      // Durable receipts keep retries free even after local workshop history is pruned.
      const changed = JSON.stringify(state) !== JSON.stringify(row.state);
      const revision = changed ? (await persist(tx, row, state)).revision : row.revision;
      return {
        worldId,
        villageId,
        playerId: actor.id,
        revision,
        paused: row.paused,
        ended: state.season.status === 'ended',
        ...projectWorkshop(village, now),
      };
    }
    if (row.paused) throw new KingdomsHttpError(409, 'العالم متوقف مؤقتًا.');
    if (state.season.status === 'ended') throw new KingdomsHttpError(409, 'انتهى الموسم.');
    const recent = await tx.kingdomCommand.count({
      where: { actorId: actor.id, worldId, createdAt: { gt: new Date(now - 60000) } },
    });
    if (recent >= 30) throw new KingdomsHttpError(429, 'بلغت حد الأوامر لهذه الدقيقة.');
    const updated = applyWorkshopAction(village, action, now);
    const saved = await persist(tx, row, {
      ...state,
      villages: { ...state.villages, [villageId]: updated },
    });
    await tx.kingdomCommand.create({
      data: { worldId, actorId: actor.id, key, fingerprint, revision: saved.revision },
    });
    return {
      worldId,
      villageId,
      playerId: actor.id,
      revision: saved.revision,
      paused: false,
      ended: false,
      ...projectWorkshop(updated, now),
    };
  }, db);
}

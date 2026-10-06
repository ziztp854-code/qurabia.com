import 'server-only';
import type { DatabaseClient, Prisma } from '@tahaddi/database';
import { kingdomTransaction, type KingdomIdentity } from './repository';
import { KingdomsHttpError } from './http';
import { gardenReadSchema, gardenSlotsSchema, type GardenPlacement } from './palace-garden';
import type { KingdomsWorld, Village } from './types';

type GardenVillage = Village & { palaceGarden?: { version: 1; slots: GardenPlacement[] } };
type WorldRow = { id: string; state: unknown; revision: number; paused: boolean };

async function authorize(tx: Prisma.TransactionClient, identity: KingdomIdentity) {
  const user = await tx.user.findUnique({
    where: { id: identity.id }, select: { status: true, tokenVersion: true },
  });
  if (!user || user.status !== 'ACTIVE' || user.tokenVersion !== identity.tokenVersion)
    throw new KingdomsHttpError(401, 'الجلسة غير صالحة.');
}

function ownedVillage(row: WorldRow | null | undefined, villageId: string, playerId: string) {
  if (!row) throw new KingdomsHttpError(404, 'العالم غير موجود.');
  const state = row.state as KingdomsWorld;
  const village = Object.hasOwn(state.villages, villageId) ? state.villages[villageId] as GardenVillage : undefined;
  if (!village || village.ownerId !== playerId)
    throw new KingdomsHttpError(403, 'هذه الحديقة ليست ضمن قريتك.');
  return { state, village };
}

export async function readPalaceGarden(
  worldId: string, villageId: string, identity: KingdomIdentity, db?: DatabaseClient,
) {
  gardenReadSchema.parse({ worldId, villageId });
  const actor = Object.freeze({ ...identity });
  return kingdomTransaction(async (tx) => {
    await authorize(tx, actor);
    const row = await tx.kingdomWorld.findUnique({ where: { id: worldId } });
    const { village } = ownedVillage(row, villageId, actor.id);
    return { worldId, villageId, playerId: actor.id, revision: row!.revision,
      slots: gardenSlotsSchema.parse(village.palaceGarden?.slots ?? []) };
  }, db);
}

export async function savePalaceGarden(
  worldId: string, villageId: string, identity: KingdomIdentity, input: unknown, db?: DatabaseClient,
) {
  gardenReadSchema.parse({ worldId, villageId });
  const slots = gardenSlotsSchema.parse(input).sort((a, b) => a.slotId - b.slotId);
  const actor = Object.freeze({ ...identity });
  return kingdomTransaction(async (tx) => {
    const [row] = await tx.$queryRaw<WorldRow[]>`SELECT id, state, revision, paused FROM "KingdomWorld" WHERE id = ${worldId} FOR UPDATE`;
    // Revalidate after a competing command releases the world lock.
    await authorize(tx, actor);
    const { state, village } = ownedVillage(row, villageId, actor.id);
    const savedState = { ...state, villages: { ...state.villages,
      [villageId]: { ...village, palaceGarden: { version: 1, slots } },
    } };
    const saved = await tx.kingdomWorld.update({ where: { id: worldId }, data: {
      state: JSON.parse(JSON.stringify(savedState)) as Prisma.InputJsonValue,
      revision: { increment: 1 },
    } });
    // No gameplay tick, pause, coordinates, resources or nextEventAt fields are touched.
    return { worldId, villageId, playerId: actor.id, revision: saved.revision, slots };
  }, db);
}

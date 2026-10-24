import { z } from 'zod';
import { getArm, getBuilding, getLevel, catalog } from './catalog';
import type { AlfazaaState } from './types';

const integer = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const node = z
  .object({
    id: z.string().max(40),
    camp: z.number().int().min(0).max(4),
    x: z.number().finite(),
    y: z.number().finite(),
    hp: z.number().min(0).max(65),
    buildingType: z.number().int().min(1).max(3),
  })
  .strict();
const route = z.object({ from: z.string().max(40), to: z.string().max(40) }).strict();
const battle = z
  .object({
    levelId: integer,
    startedAt: integer,
    updatedAt: integer,
    elapsedMs: integer.max(240000),
    status: z.enum(['ready', 'active', 'won', 'lost']),
    buildings: z.array(node).min(1).max(100),
    routes: z.array(route).max(100),
    troops: z
      .array(
        route.extend({
          id: integer,
          camp: z.number().int().min(1).max(4),
          progress: z.number().min(0).max(1),
          count: z.number().min(0).max(65),
        }),
      )
      .max(2000),
    nextTroopId: integer,
  })
  .strict();
const schema = z
  .object({
    version: z.union([z.literal(1), z.literal(2)]),
    revision: integer,
    castleLevel: integer.min(1).max(100),
    balances: z.record(z.string().regex(/^\d{1,9}$/), integer.max(1e12)),
    cells: z
      .array(
        z
          .object({
            id: z.string().min(1).max(40),
            kind: z.enum(['troop', 'building']),
            cfgId: integer,
          })
          .strict()
          .nullable(),
      )
      .length(36),
    nextId: integer.min(1),
    lastCollectedAt: integer,
    completedTowerLevels: z.array(integer).max(65),
    battle: battle.nullable(),
    updatedAt: integer,
    quests: z
      .object({
        claimed: z.array(z.enum(['road-104', 'road-301'])).max(2),
        lastDailyClaimDay: integer.nullable(),
      })
      .strict()
      .optional(),
  })
  .strict();

export function validateState(raw: unknown): AlfazaaState | null {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return null;
  if (parsed.data.lastCollectedAt > parsed.data.updatedAt) return null;
  if (parsed.data.version === 1 && parsed.data.quests !== undefined) return null;
  if (parsed.data.version === 2 && !parsed.data.quests) return null;
  let state: AlfazaaState = {
    ...parsed.data,
    version: 2,
    quests: parsed.data.quests ?? { claimed: [], lastDailyClaimDay: null },
  };
  // One-time v1 compatibility: preserve progress while preventing an old city
  // without housing or cash from becoming unable to earn under the new model.
  if (
    parsed.data.version === 1 &&
    !state.cells.some((cell) => cell?.kind === 'building' && getBuilding(cell.cfgId)?.type === 4)
  ) {
    const empty = state.cells.indexOf(null),
      house = catalog.buildings.find((row) => row.type === 4 && row.level === 1);
    if (!house) return null;
    if (empty >= 0) {
      let id = state.nextId;
      while (state.cells.some((cell) => cell?.id === String(id)) && id < Number.MAX_SAFE_INTEGER)
        id++;
      if (!Number.isSafeInteger(id + 1)) return null;
      state = {
        ...state,
        nextId: id + 1,
        lastCollectedAt: state.updatedAt,
        cells: state.cells.map((cell, index) =>
          index === empty ? { id: String(id), kind: 'building', cfgId: house.id } : cell,
        ),
      };
    } else {
      const cost = house.buildCost.find(([item]) => item === catalog.meta.goldItemId)?.[1] ?? 0;
      state = {
        ...state,
        balances: {
          ...state.balances,
          [catalog.meta.goldItemId]: Math.max(state.balances[catalog.meta.goldItemId] ?? 0, cost),
        },
      };
    }
  }
  if (state.lastCollectedAt > state.updatedAt) return null;
  if (new Set(state.quests.claimed).size !== state.quests.claimed.length) return null;
  if (
    state.quests.lastDailyClaimDay !== null &&
    state.quests.lastDailyClaimDay > Math.floor((state.updatedAt + 10_800_000) / 86_400_000)
  )
    return null;
  if (!catalog.buildings.some((b) => b.type === 11 && b.level === state.castleLevel)) return null;
  const cells = state.cells.filter((c) => c !== null);
  if (new Set(cells.map((c) => c.id)).size !== cells.length) return null;
  if (cells.some((c) => (c.kind === 'troop' ? !getArm(c.cfgId) : !getBuilding(c.cfgId))))
    return null;
  if (
    state.completedTowerLevels.some((id) => !getLevel(id)) ||
    new Set(state.completedTowerLevels).size !== state.completedTowerLevels.length
  )
    return null;
  if (state.battle) {
    const b = state.battle;
    const level = getLevel(b.levelId);
    if (!level || b.startedAt > b.updatedAt || b.updatedAt > state.updatedAt) return null;
    const ids = new Set(b.buildings.map((n) => n.id));
    if (ids.size !== b.buildings.length || b.buildings.length !== level.buildings.length)
      return null;
    if (
      b.buildings.some(
        (n) =>
          !level.buildings.some(
            (o) => o.id === n.id && o.x === n.x && o.y === n.y && o.buildingType === n.buildingType,
          ),
      )
    )
      return null;
    if (
      [...b.routes, ...b.troops].some((r) => r.from === r.to || !ids.has(r.from) || !ids.has(r.to))
    )
      return null;
  }
  return state;
}

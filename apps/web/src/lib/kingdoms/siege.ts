import { unitKeys } from './types';
import { marchTravelDurationMs } from './commander-movement';
import { type Building, type KingdomsWorld, type Movement, type Siege, type SiegeConfig, type SiegeView, type Village } from './types';

export function createSiege(w: KingdomsWorld, m: Movement, at: number): Siege {
  const config = w.config.siegeConfig!;
  const target = Object.values(w.villages).find((v) => v.x === m.targetX && v.y === m.targetY);
  const firstStage = config.stages[0];
  return {
    id: `s${w.nextId}`,
    ownerId: m.ownerId,
    sourceId: m.sourceId,
    targetX: m.targetX,
    targetY: m.targetY,
    villageId: target?.id,
    troops: { ...m.troops },
    stage: firstStage.key,
    supply: unitKeys.reduce((sum, k) => sum + m.troops[k], 0) * config.supplyRate,
    startedAt: at,
    stageStartedAt: at,
    stageDeadline: at + firstStage.durationMs,
    nextTickAt: at + config.tickIntervalMs,
    wallDamage: 0,
    buildingDamage: {},
  };
}

export function advanceSiegeStage(siege: Siege, config: SiegeConfig): Siege {
  const stages = config.stages;
  const currentIndex = stages.findIndex((stage) => stage.key === siege.stage);
  if (currentIndex < 0 || currentIndex >= stages.length - 1) return siege;
  const next = stages[currentIndex + 1];
  return {
    ...siege,
    stage: next.key,
    stageStartedAt: siege.stageDeadline,
    stageDeadline: siege.stageDeadline + next.durationMs,
  };
}

export function applySiegeDamage(siege: Siege, village: Village, config: SiegeConfig): { siege: Siege; village: Village } {
  const wallDamage = Math.min(config.wallDamage, village.buildings.wall);
  const buildingDamage: Partial<Record<Building, number>> = {};
  for (const key of config.supplyBuildingKeys as Building[]) {
    if (key === 'wall') continue;
    const current = village.buildings[key];
    const damage = Math.min(current, Math.max(0, config.damagePerTick));
    if (damage > 0) buildingDamage[key] = damage;
  }
  const updatedVillage: Village = {
    ...village,
    buildings: {
      ...village.buildings,
      wall: Math.max(0, village.buildings.wall - wallDamage),
      ...Object.fromEntries(
        Object.entries(buildingDamage).map(([k, v]) => [k, Math.max(0, village.buildings[k as Building] - v)]),
      ),
    },
  };
  return {
    siege: {
      ...siege,
      wallDamage: siege.wallDamage + wallDamage,
      buildingDamage: {
        ...siege.buildingDamage,
        ...Object.fromEntries(
          Object.entries(buildingDamage).map(([k, v]) => [k, (siege.buildingDamage[k as Building] ?? 0) + v]),
        ),
      },
    },
    village: updatedVillage,
  };
}

export function withdrawSiege(w: KingdomsWorld, siege: Siege, at: number): void {
  const home = w.villages[siege.sourceId];
  const source = home?.ownerId === siege.ownerId ? home : Object.values(w.villages).find((v) => v.ownerId === siege.ownerId);
  if (!source || !unitKeys.some((k) => siege.troops[k] > 0)) {
    w.sieges = { ...(w.sieges ?? {}) };
    delete w.sieges[siege.id];
    return;
  }
  // Withdrawal creates a new journey; no existing movement deadline is recalculated.
  const travelMs = marchTravelDurationMs(
    w.config,
    { x: siege.targetX, y: siege.targetY },
    source,
    siege.troops,
  )!;
  w.movements.push({
    id: `m${w.nextId}`,
    ownerId: siege.ownerId,
    sourceId: source.id,
    originX: siege.targetX,
    originY: siege.targetY,
    targetX: source.x,
    targetY: source.y,
    mission: 'return',
    troops: { ...siege.troops },
    departedAt: at,
    arrivesAt: at + travelMs,
    travelMs,
    loot: { wood: 0, stone: 0, iron: 0, food: 0, gold: 0 },
  });
  w.sieges = { ...(w.sieges ?? {}) };
  delete w.sieges[siege.id];
}

export function projectSiegeView(siege: Siege, actorId: string): SiegeView | null {
  if (siege.ownerId !== actorId) return null;
  return siege as SiegeView;
}

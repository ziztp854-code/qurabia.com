import { catalog, getLevel } from './catalog';
import type { TowerBattle, TowerNode, TowerRoute } from './types';

const STEP = 200;
const MAX_HP = 65;
const TIMEOUT = 240000;
function checkTime(battle: TowerBattle, now: number) {
  if (!Number.isSafeInteger(now) || now < battle.updatedAt) throw new Error('INVALID_TIME');
}
export function createTowerBattle(levelId: number, now: number): TowerBattle {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('INVALID_TIME');
  const level = getLevel(levelId);
  if (!level) throw new Error('INVALID_LEVEL');
  return {
    levelId,
    startedAt: now,
    updatedAt: now,
    elapsedMs: 0,
    status: 'active',
    buildings: level.buildings.map((b) => ({ ...b })),
    routes: [],
    troops: [],
    nextTroopId: 1,
  };
}
function blocked(levelId: number, from: TowerNode, to: TowerNode) {
  const dx = to.x - from.x,
    dy = to.y - from.y,
    length = dx * dx + dy * dy;
  return (getLevel(levelId)?.barriers ?? []).some((b) => {
    const t = Math.max(0, Math.min(1, ((b.x - from.x) * dx + (b.y - from.y) * dy) / length));
    return Math.hypot(b.x - (from.x + t * dx), b.y - (from.y + t * dy)) < 32;
  });
}
export function connectTowerRoute(
  input: TowerBattle,
  from: string,
  to: string,
  now: number,
): TowerBattle {
  const battle = advanceTowerBattle(input, now);
  if (battle.status !== 'active') throw new Error('BATTLE_FINISHED');
  const source = battle.buildings.find((b) => b.id === from),
    target = battle.buildings.find((b) => b.id === to);
  if (!source || !target || from === to) throw new Error('INVALID_ROUTE');
  if (source.camp !== catalog.meta.blueCamp) throw new Error('NOT_OWNED');
  if (blocked(battle.levelId, source, target)) throw new Error('ROUTE_BLOCKED');
  if (battle.routes.some((r) => r.from === from && r.to === to)) return battle;
  if (battle.routes.filter((r) => r.from === from).length >= 3) throw new Error('ROUTE_LIMIT');
  return { ...battle, routes: [...battle.routes, { from, to }] };
}
export function disconnectTowerRoute(
  input: TowerBattle,
  from: string,
  to: string,
  now: number,
): TowerBattle {
  const battle = advanceTowerBattle(input, now);
  const source = battle.buildings.find((n) => n.id === from);
  if (!source || source.camp !== catalog.meta.blueCamp) throw new Error('NOT_OWNED');
  return { ...battle, routes: battle.routes.filter((r) => r.from !== from || r.to !== to) };
}
// An independent deterministic training model: source building growth timing,
// one-second dispatch, 160 map units/second transport, three routes per source.
// This does not reproduce the unavailable original server or its combat outcomes.
function tick(battle: TowerBattle): TowerBattle {
  const nodes = battle.buildings.map((n) => {
    const rows = catalog.growth.building as {
      type: number;
      base_hp_time: number | string;
      max_hp_time: number | string;
    }[];
    const growth = rows.find((row) => row.type === n.buildingType);
    const base = Number(growth?.base_hp_time) || 2000;
    const max = Number(growth?.max_hp_time) || base;
    const interval = Math.max(200, base + ((max - base) * n.hp) / MAX_HP);
    return n.camp === catalog.meta.neutralCamp
      ? { ...n }
      : { ...n, hp: Math.min(MAX_HP, n.hp + STEP / interval) };
  });
  let troops = battle.troops.map((t) => ({ ...t }));
  let nextId = battle.nextTroopId;
  const elapsed = battle.elapsedMs + STEP;
  if (Math.floor(elapsed / 1000) > Math.floor(battle.elapsedMs / 1000)) {
    const ai: TowerRoute[] = nodes
      .filter(
        (n) => n.camp !== catalog.meta.blueCamp && n.camp !== catalog.meta.neutralCamp && n.hp >= 3,
      )
      .flatMap((n) => {
        const target = nodes
          .filter((t) => t.camp !== n.camp && !blocked(battle.levelId, n, t))
          .sort((a, b) => Math.hypot(a.x - n.x, a.y - n.y) - Math.hypot(b.x - n.x, b.y - n.y))[0];
        return target ? [{ from: n.id, to: target.id }] : [];
      });
    for (const route of [...battle.routes, ...ai]) {
      const source = nodes.find((n) => n.id === route.from);
      if (!source || source.hp < 2 || source.camp === 0) continue;
      const isPlayer = battle.routes.includes(route);
      if (isPlayer && source.camp !== catalog.meta.blueCamp) continue;
      const count = Math.min(2, Math.floor(source.hp) - 1);
      source.hp -= count;
      troops = [...troops, { ...route, id: nextId++, camp: source.camp, count, progress: 0 }];
    }
  }
  const travelling: typeof troops = [];
  for (const troop of troops) {
    const from = nodes.find((n) => n.id === troop.from)!,
      to = nodes.find((n) => n.id === troop.to)!;
    const progress = troop.progress + 32 / Math.max(32, Math.hypot(to.x - from.x, to.y - from.y));
    if (progress < 1) {
      travelling.push({ ...troop, progress });
      continue;
    }
    if (to.camp === troop.camp) to.hp = Math.min(MAX_HP, to.hp + troop.count);
    else if (to.hp < troop.count) {
      to.camp = troop.camp;
      to.hp = troop.count - to.hp;
    } else to.hp -= troop.count;
  }
  const blue = nodes.some((n) => n.camp === catalog.meta.blueCamp);
  const hostile = nodes.some((n) => n.camp !== catalog.meta.blueCamp);
  const status = !blue ? 'lost' : !hostile ? 'won' : elapsed >= TIMEOUT ? 'lost' : 'active';
  return {
    ...battle,
    buildings: nodes,
    troops: travelling,
    nextTroopId: nextId,
    elapsedMs: elapsed,
    updatedAt: battle.updatedAt + STEP,
    status,
    routes: battle.routes.filter(
      (r) => nodes.find((n) => n.id === r.from)?.camp === catalog.meta.blueCamp,
    ),
  };
}
export function advanceTowerBattle(input: TowerBattle, now: number): TowerBattle {
  checkTime(input, now);
  if (input.status !== 'active') return input;
  let battle = input;
  const steps = Math.min(300, Math.floor((now - input.updatedAt) / STEP));
  for (let i = 0; i < steps && battle.status === 'active'; i++) battle = tick(battle);
  return battle;
}

import { z } from 'zod';
import bootstrap from './data/hero-bootstrap.json';
import type { HeroSnapshot } from './common';
import type { HeroState, OwnedHero } from './hero-types';
import { heroBattleModes } from './hero-types';
const n = z.number().int().min(0).max(1e12);
const time = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const id = n.positive().max(2147483647);
const gear = z.strictObject({ id: id, itemId: id, level: n.max(bootstrap.gearMax) });
const skill = z.strictObject({ id, level: n.min(1).max(40), xp: n });
const unit = z.strictObject({
  id: z.string().min(1).max(40),
  side: z.enum(['player', 'enemy']),
  cfgId: id,
  hp: n,
  maxHp: n.positive(),
  attack: n,
  defense: n,
  speed: n,
  cell: n.max(35).nullable(),
});
const report = z.strictObject({
  id,
  rulesVersion: z.literal(1),
  mode: z.enum(heroBattleModes),
  stageId: id,
  resolvedAt: time,
  won: z.boolean(),
  firstClear: z.boolean(),
  turns: n.max(40),
  staminaCost: n.max(100),
  reward: z.array(z.tuple([id, n])).max(100),
  units: z.array(unit).max(18),
  events: z
    .array(
      z.strictObject({
        turn: n.max(40),
        actor: z.string().max(40),
        target: z.string().max(40),
        kind: z.enum([
          'attack',
          'strike',
          'heal',
          'shield',
          'poison',
          'stun',
          'weaken',
          'buff',
          'defeat',
        ]),
        amount: n,
        remaining: n,
        heroId: id.optional(),
      }),
    )
    .max(120),
  injuries: z.array(z.strictObject({ cell: n.max(35), cfgId: id })).max(9),
  logTruncated: z.boolean(),
});
const schema = z.strictObject({
  rulesVersion: z.literal(1),
  roster: z.record(
    z.string().regex(/^\d{1,9}$/),
    z.strictObject({
      id,
      level: n.min(1).max(120),
      xp: n,
      star: n.max(20),
      skills: z.array(skill.nullable()).length(5),
      equipment: gear.nullable(),
    }),
  ),
  party: z.array(id).min(1).max(2),
  troopCells: z.array(n.max(35)).max(9),
  formationType: n.min(1).max(4),
  formationLevels: z.record(z.string().regex(/^[1-4]$/), n.max(20)),
  fortifications: z.record(z.string().regex(/^[1-4]:[0-8]$/), n.max(bootstrap.fortifyMax)),
  spareEquipment: z.array(gear).max(200),
  nextEquipmentId: id,
  stamina: n.max(100),
  staminaAt: time,
  restDay: n.max(1e9),
  restPurchases: n.max(3),
  battleCounter: n.max(2147483646),
  completed: z.strictObject(
    Object.fromEntries(heroBattleModes.map((mode) => [mode, z.array(id).max(2000)])) as Record<
      (typeof heroBattleModes)[number],
      z.ZodArray<typeof id>
    >,
  ),
  lastBattle: report.nullable(),
});
const unique = <T>(values: T[]) => new Set(values).size === values.length;
export function newOwnedHero(id: number): OwnedHero {
  const definition = bootstrap.heroes.find((hero) => hero.id === id);
  if (!definition) throw new Error('INVALID_HERO');
  return {
    id,
    level: 1,
    xp: 0,
    star: 0,
    skills: [{ id: definition.born, level: 1, xp: 0 }, null, null, null, null],
    equipment: null,
  };
}
export function createHeroState(now: number): HeroState {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('INVALID_TIME');
  const id = bootstrap.starterHeroId;
  return {
    rulesVersion: 1,
    roster: { [id]: newOwnedHero(id) },
    party: [id],
    troopCells: [],
    formationType: 1,
    formationLevels: { '1': 0 },
    fortifications: {},
    spareEquipment: [],
    nextEquipmentId: 1,
    stamina: 100,
    staminaAt: now,
    restDay: Math.floor((now + 10800000) / 86400000),
    restPurchases: 0,
    battleCounter: 0,
    completed: Object.fromEntries(
      heroBattleModes.map((mode) => [mode, []]),
    ) as unknown as HeroState['completed'],
    lastBattle: null,
  };
}
export function advanceHeroState(state: HeroState, now: number): HeroState {
  if (!Number.isSafeInteger(now) || now < state.staminaAt) throw new Error('INVALID_TIME');
  const elapsed = Math.floor((now - state.staminaAt) / 300000);
  const stamina = Math.min(100, state.stamina + elapsed);
  const day = Math.floor((now + 10800000) / 86400000);
  return {
    ...state,
    stamina,
    staminaAt: stamina === 100 ? now : state.staminaAt + elapsed * 300000,
    restDay: day,
    restPurchases: day === state.restDay ? state.restPurchases : 0,
  };
}
export function getHeroSnapshot(state: HeroState): HeroSnapshot[] {
  return Object.values(state.roster).map((hero) => ({
    id: hero.id,
    level: hero.level,
    rarity: bootstrap.heroes.find((x) => x.id === hero.id)?.rarity,
    ...(hero.equipment
      ? {
          equipment: {
            itemId: hero.equipment.itemId,
            level: hero.equipment.level,
            quality: (bootstrap.gearQuality as Record<string, number>)[hero.equipment.itemId],
          },
        }
      : {}),
    stars: 1 + Math.floor(hero.star / 5),
    skills: hero.skills.filter((x) => x !== null).map((x) => x.id),
    skillLevels: hero.skills.filter((x) => x !== null).map((x) => x.level),
  }));
}
export const getCampaignCompleted = (state: HeroState) => state.completed.campaign;
export function validateHeroState(raw: unknown): HeroState | null {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return null;
  const s = parsed.data;
  if (
    Object.keys(s.roster).length > 57 ||
    !unique(s.party) ||
    !unique(s.troopCells) ||
    s.party.some((x) => !s.roster[x])
  )
    return null;
  for (const [key, hero] of Object.entries(s.roster)) {
    const cfg = bootstrap.heroes.find((x) => x.id === hero.id);
    if (
      !cfg ||
      key !== String(hero.id) ||
      !hero.skills[0] ||
      hero.level > bootstrap.levelCaps[Math.min(5, 1 + Math.floor(hero.star / 5))]
    )
      return null;
    const tier = Math.min(5, 1 + Math.floor(hero.star / 5));
    if (hero.skills[0].id !== cfg.bornTiers[tier - 1] || hero.skills[0].level !== tier) return null;
    if (!unique(hero.skills.flatMap((x) => (x ? [x.id] : [])))) return null;
    if (
      hero.skills
        .slice(1)
        .some((x) => x && (!cfg.recommended.includes(x.id) || x.level > bootstrap.skillCaps[tier]))
    )
      return null;
    if (
      hero.skills.some(
        (x, i) => x && (!cfg.skills.includes(x.id) || hero.level < bootstrap.skillUnlocks[i]),
      )
    )
      return null;
  }
  const gears = [
    ...s.spareEquipment,
    ...Object.values(s.roster).flatMap((h) => (h.equipment ? [h.equipment] : [])),
  ];
  if (
    !unique(gears.map((x) => x.id)) ||
    gears.some((x) => !bootstrap.gearIds.includes(x.itemId) || x.id >= s.nextEquipmentId)
  )
    return null;
  if (
    Object.entries(s.formationLevels).some(
      ([key, level]) => level > (bootstrap.formationMax as Record<string, number>)[key],
    )
  )
    return null;
  if (s.formationType !== 1 && !(s.formationLevels[String(s.formationType)] > 0)) return null;
  if (
    heroBattleModes.some(
      (mode) =>
        !unique(s.completed[mode]) ||
        s.completed[mode].some((x) => !bootstrap.modeIds[mode].includes(x)),
    )
  )
    return null;
  if (s.lastBattle) {
    const b = s.lastBattle;
    const ids = b.units.map((x) => x.id);
    if (
      b.id > s.battleCounter ||
      !unique(ids) ||
      b.units.some((x) => x.hp > x.maxHp || !bootstrap.armIds.includes(x.cfgId))
    )
      return null;
    if (!bootstrap.modeIds[b.mode].includes(b.stageId)) return null;
    if (
      b.events.some(
        (e) =>
          !ids.includes(e.actor) ||
          !ids.includes(e.target) ||
          (e.heroId !== undefined && !s.roster[e.heroId]),
      )
    )
      return null;
  }
  return s as HeroState;
}

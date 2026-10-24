import { z } from 'zod';
import type { GameEvent } from './common';
import bootstrap from './data/systems-bootstrap.json';
import type { SystemsState } from './systems-types';
import { LIMIT, riyadhDay } from './systems-utils';
const safe = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const numericRecord = z
  .record(z.string().max(100), safe.max(LIMIT))
  .refine((r) => Object.keys(r).length <= 12000);
export const systemsStateSchema = z.strictObject({
  rulesVersion: z.literal(1),
  lastAt: safe,
  day: safe,
  week: safe,
  weekly: numericRecord,
  lifetime: numericRecord,
  daily: numericRecord,
  research: numericRecord,
  jobs: z
    .array(
      z.strictObject({
        id: safe,
        kind: z.enum(['research', 'training', 'healing', 'hatch']),
        startedAt: safe,
        finishAt: safe,
        target: safe,
        count: safe,
        tree: z.enum(['college', 'science']).optional(),
      }),
    )
    .max(8),
  nextJobId: safe.min(1),
  reserve: numericRecord,
  wounded: numericRecord,
  claims: z.array(z.string().max(80)).max(2200),
  dailyClaims: z.array(safe).max(10),
  dailyChoices: z.array(safe).max(10),
  boxes: z.array(safe).max(4),
  shopLifetime: numericRecord,
  shopDaily: numericRecord,
  beasts: numericRecord,
  destroyerLevel: safe.max(200),
  relics: numericRecord,
  equippedRelics: z.array(safe).max(6),
  eventClaims: z.array(z.string().max(80)).max(1000),
});
export function createSystemsState(now: number): SystemsState {
  if (!Number.isSafeInteger(now) || now < 0) throw Error('INVALID_TIME');
  return {
    rulesVersion: 1,
    lastAt: now,
    day: riyadhDay(now),
    week: Math.floor((riyadhDay(now) + 3) / 7),
    weekly: {},
    lifetime: {},
    daily: {},
    research: {},
    jobs: [],
    nextJobId: 1,
    reserve: {},
    wounded: {},
    claims: [],
    dailyClaims: [],
    dailyChoices: [],
    boxes: [],
    shopLifetime: {},
    shopDaily: {},
    beasts: {},
    destroyerLevel: 0,
    relics: {},
    equippedRelics: [],
    eventClaims: [],
  };
}
export function validateSystemsState(raw: unknown): SystemsState | null {
  const result = systemsStateSchema.safeParse(raw);
  if (!result.success) return null;
  const state = result.data;
  if (
    [
      state.claims,
      state.dailyClaims,
      state.dailyChoices,
      state.boxes,
      state.equippedRelics,
      state.eventClaims,
    ].some((a) => new Set<string | number>(a).size !== a.length)
  )
    return null;
  if (
    new Set(state.jobs.map((j) => j.id)).size !== state.jobs.length ||
    state.jobs.some(
      (j) => j.finishAt < j.startedAt || j.startedAt > state.lastAt || j.id >= state.nextJobId,
    )
  )
    return null;
  if (state.day !== riyadhDay(state.lastAt) || state.week !== Math.floor((state.day + 3) / 7))
    return null;
  for (const [key, id] of Object.entries(state.research)) {
    if (!(bootstrap.researchIds as Record<string, number[]>)[key]?.includes(id)) return null;
  }
  if (
    state.claims.some((key) => {
      const [family, id] = key.split(':');
      return (
        !/^(main|road|plot|milestone):[1-9][0-9]*$/.test(key) ||
        !(bootstrap.questIds as Record<string, number[]>)[family]?.includes(Number(id))
      );
    })
  )
    return null;
  if (
    state.dailyClaims.some((id) => !state.dailyChoices.includes(id)) ||
    [...state.dailyClaims, ...state.dailyChoices].some(
      (id) => !bootstrap.questIds.daily.includes(id),
    ) ||
    state.boxes.some((i) => i > 3)
  )
    return null;
  if (
    [...Object.entries(state.reserve), ...Object.entries(state.wounded)].some(
      ([id, n]) => !bootstrap.armIds.includes(+id) || n > 100000,
    )
  )
    return null;
  if (
    Object.entries(state.beasts).some(
      ([id, n]) => !bootstrap.beastIds.includes(+id) || n < 1 || n > 100,
    )
  )
    return null;
  const slots = bootstrap.relicSlots as Record<string, number>;
  if (
    Object.entries(state.relics).some(([id, n]) => !slots[id] || n < 1 || n > 52) ||
    state.equippedRelics.some((id) => !state.relics[id]) ||
    new Set(state.equippedRelics.map((id) => slots[id])).size !== state.equippedRelics.length
  )
    return null;
  if (
    state.jobs.some(
      (j) =>
        j.id < 1 ||
        j.count < 1 ||
        j.count > 100 ||
        j.finishAt - j.startedAt > 604800000 ||
        (j.kind === 'research'
          ? !j.tree ||
            !Object.entries(bootstrap.researchIds).some(
              ([key, ids]) => key.startsWith(j.tree + ':') && ids.includes(j.target),
            )
          : j.tree !== undefined ||
            !(j.kind === 'hatch' ? bootstrap.beastIds : bootstrap.armIds).includes(j.target)),
    )
  )
    return null;
  if (
    state.jobs.filter((j) => j.kind === 'training').length > 3 ||
    state.jobs.filter((j) => j.kind === 'healing').length > 1 ||
    state.jobs.filter((j) => j.kind === 'hatch').length > 1 ||
    ['college', 'science'].some(
      (tree) => state.jobs.filter((j) => j.kind === 'research' && j.tree === tree).length > 1,
    )
  )
    return null;
  return state as SystemsState;
}
export function resetSystemsDay(state: SystemsState, now: number): SystemsState {
  if (!Number.isSafeInteger(now) || now < state.lastAt) throw Error('INVALID_TIME');
  const week = Math.floor((riyadhDay(now) + 3) / 7);
  const current = week === state.week ? state : { ...state, week, weekly: {} };
  return riyadhDay(now) === state.day
    ? { ...current, lastAt: now }
    : {
        ...current,
        lastAt: now,
        day: riyadhDay(now),
        daily: {},
        dailyClaims: [],
        dailyChoices: [],
        boxes: [],
        shopDaily: {},
      };
}
export function recordGameEvents(
  state: SystemsState,
  events: GameEvent[],
  now: number,
): SystemsState {
  let next = resetSystemsDay(state, now);
  for (const event of events) {
    if (
      !/^[a-z][a-z0-9-]{0,60}$/.test(event.type) ||
      !Number.isSafeInteger(event.amount) ||
      event.amount < 0 ||
      event.amount > LIMIT ||
      (event.target !== undefined &&
        (!Number.isSafeInteger(event.target) || event.target < 0 || event.target > 2147483647)) ||
      (event.level !== undefined &&
        (!Number.isSafeInteger(event.level) || event.level < 0 || event.level > 1000))
    )
      throw Error('INVALID_RESOURCE');
    const keys = [
      event.type,
      ...(event.target === undefined ? [] : [`${event.type}:${event.target}`]),
    ];
    if (event.type === 'merge' && event.level)
      for (let level = 1; level <= Math.min(100, event.level); level++)
        keys.push(`merge:atleast:${level}`);
    if (event.type === 'worldmonster-win' && event.level)
      for (let level = 1; level <= Math.min(100, event.level); level++)
        keys.push(`worldmonster-win:atleast:${level}`);
    if (event.type === 'expedition-win' && event.target)
      for (let stage = 1; stage <= Math.min(1000, event.target); stage++)
        keys.push(`expedition-stage:${stage}`);
    if (event.type === 'recruit' && event.target && bootstrap.infantryIds.includes(event.target))
      keys.push('recruit-infantry');
    if (
      event.type === 'item-use' &&
      event.target &&
      [110021, 110022, 110023, 110024, 110025].includes(event.target)
    )
      keys.push('hero-xp-item');
    const lifetime = { ...next.lifetime },
      daily = { ...next.daily },
      weekly = { ...next.weekly };
    for (const key of keys) {
      lifetime[key] = Math.min(LIMIT, (lifetime[key] ?? 0) + event.amount);
      daily[key] = Math.min(LIMIT, (daily[key] ?? 0) + event.amount);
      weekly[key] = Math.min(LIMIT, (weekly[key] ?? 0) + event.amount);
    }
    next = { ...next, lifetime, daily, weekly };
    if (event.type === 'troop-wounded' && event.target)
      next = {
        ...next,
        wounded: {
          ...next.wounded,
          [event.target]: Math.min(100000, (next.wounded[event.target] ?? 0) + event.amount),
        },
      };
  }
  return next;
}

import type { GameplayContext, Reward } from './common';
import { systemsCatalog } from './systems-catalog';
import type { SystemsState } from './systems-types';
import { accepted, transact } from './systems-utils';
/** Independent unlock: castle2; source HatchLimit predicates are unavailable. */
export function hatchBeast(state: SystemsState, id: number, context: GameplayContext) {
  const row = systemsCatalog.beasts.find((r) => r.id === id);
  if (!row || context.view.castleLevel < 2 || (state.beasts[id] ?? 0) > 0)
    throw Error('REQUIREMENT');
  if (state.jobs.some((j) => j.kind === 'hatch') || state.jobs.length >= 8)
    throw Error('QUEUE_FULL');
  const balances = transact(context.balances, row.cost);
  const job = {
    id: state.nextJobId,
    kind: 'hatch' as const,
    target: id,
    count: 1,
    startedAt: context.now,
    finishAt: context.now + Math.max(1, Math.min(604800, row.seconds)) * 1000,
  };
  return accepted(
    { ...state, jobs: [...state.jobs, job], nextJobId: state.nextJobId + 1 },
    balances,
    [],
    'بدأ احتضان المرافق.',
  );
}
export function feedBeast(state: SystemsState, id: number, context: GameplayContext) {
  const row = systemsCatalog.beasts.find((r) => r.id === id),
    level = state.beasts[id] ?? 0;
  if (!row || level < 1) throw Error('REQUIREMENT');
  if (level >= 100) throw Error('MAX_LEVEL');
  return accepted(
    { ...state, beasts: { ...state.beasts, [id]: level + 1 } },
    transact(context.balances, row.feedCost),
    [{ type: 'beast-feed', amount: 1, target: id, level: level + 1 }],
    'ارتفع مستوى المرافق.',
  );
}
/** Source training XP cost translated to ceil(NeedExp/100) blueprints. */
export function upgradeDestroyer(state: SystemsState, context: GameplayContext) {
  const row = systemsCatalog.destroyers.find((r) => r.level === state.destroyerLevel + 1);
  if (!row) throw Error('MAX_LEVEL');
  if (context.view.castleLevel < 5) throw Error('REQUIREMENT');
  const cost: Reward = [
    ...row.cost,
    ...(row.xp > 0 ? [[110001, Math.ceil(row.xp / 100)] as [number, number]] : []),
  ];
  if (!cost.length) throw Error('REQUIREMENT');
  return accepted(
    { ...state, destroyerLevel: row.level },
    transact(context.balances, cost),
    [{ type: 'destroyer-level', amount: 1, level: row.level }],
    'تطورت عربة الحرب.',
  );
}
export function equipRelic(state: SystemsState, id: number, context: GameplayContext) {
  const row = systemsCatalog.relics.find((r) => r.id === id);
  if (!row) throw Error('REQUIREMENT');
  const owns = (state.relics[id] ?? 0) > 0;
  const balances = transact(context.balances, owns ? [] : [[id, 1]]);
  const equipped = state.equippedRelics.filter(
    (other) => systemsCatalog.relics.find((r) => r.id === other)?.slot !== row.slot,
  );
  return accepted(
    {
      ...state,
      relics: { ...state.relics, [id]: state.relics[id] ?? 1 },
      equippedRelics: [...equipped, id],
    },
    balances,
    [{ type: 'relic-equip', amount: 1, target: id }],
  );
}
export function upgradeRelic(state: SystemsState, id: number, context: GameplayContext) {
  const relic = systemsCatalog.relics.find((r) => r.id === id),
    stored = state.relics[id] ?? 0;
  if (!relic || !stored) throw Error('REQUIREMENT');
  const row = systemsCatalog.relicLevels.find(
    (r) => r.group === relic.group && r.level === stored - 1,
  );
  if (!row) throw Error('MAX_LEVEL');
  return accepted(
    { ...state, relics: { ...state.relics, [id]: stored + 1 } },
    transact(context.balances, row.cost),
    [{ type: 'relic-level', amount: 1, target: id, level: stored }],
  );
}
export function dismantleRelic(state: SystemsState, id: number, context: GameplayContext) {
  const row = systemsCatalog.relics.find((r) => r.id === id);
  if (!row || !state.relics[id] || state.equippedRelics.includes(id)) throw Error('REQUIREMENT');
  const relics = Object.fromEntries(Object.entries(state.relics).filter(([key]) => +key !== id));
  return accepted({ ...state, relics }, transact(context.balances, [], row.decompose), [
    { type: 'relic-dismantle', amount: 1, target: id },
  ]);
}
export function getProgressionView(state: SystemsState, context: GameplayContext) {
  const destroyer = systemsCatalog.destroyers.find((r) => r.level === state.destroyerLevel + 1);
  return {
    rules:
      'تنفيذ مستقل: المرافق +1 مستوى لكل إطعام حتى100؛ الاحتضان من قلعة2؛ عربة الحرب من قلعة5 وتحوّل تجربة التدريب إلى مخطوطات. الآثار تحفظ المستوى الفعلي زائد1 داخليًا.',
    beasts: systemsCatalog.beasts.map((r) => ({
      ...r,
      level: state.beasts[r.id] ?? 0,
      job: state.jobs.find((j) => j.kind === 'hatch' && j.target === r.id) ?? null,
      eligible: context.view.castleLevel >= 2,
    })),
    destroyer: {
      level: state.destroyerLevel,
      next: destroyer ?? null,
      cost: destroyer
        ? [
            ...destroyer.cost,
            ...(destroyer.xp > 0 ? [[110001, Math.ceil(destroyer.xp / 100)]] : []),
          ]
        : [],
      eligible: context.view.castleLevel >= 5,
    },
    relics: systemsCatalog.relics.map((r) => ({
      ...r,
      owned: !!state.relics[r.id],
      level: Math.max(0, (state.relics[r.id] ?? 1) - 1),
      equipped: state.equippedRelics.includes(r.id),
      next:
        systemsCatalog.relicLevels.find(
          (l) => l.group === r.group && l.level === (state.relics[r.id] ?? 1) - 1,
        ) ?? null,
    })),
  };
}

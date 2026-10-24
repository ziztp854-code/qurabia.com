import { heroCatalog } from './hero-catalog';
import { spend } from './hero-support';
import type { GameplayContext, GameplayResult } from './common';
import type { HeroState, HeroCommand } from './hero-types';
type FormationCommand = Extract<
  HeroCommand,
  { type: 'hero-formation' | 'hero-formation-upgrade' | 'hero-fortify' }
>;
export function applyHeroFormation(
  state: HeroState,
  command: FormationCommand,
  context: GameplayContext,
): GameplayResult<HeroState> {
  if (command.type === 'hero-formation') {
    if (
      new Set(command.heroIds).size !== command.heroIds.length ||
      command.heroIds.some((id) => !state.roster[id])
    )
      throw Error('INVALID_FORMATION');
    if (
      new Set(command.troopCells).size !== command.troopCells.length ||
      command.troopCells.some((index) => context.view.cells[index]?.kind !== 'troop')
    )
      throw Error('INVALID_FORMATION');
    const type = command.formationType ?? state.formationType;
    if (type !== 1 && !(state.formationLevels[type] > 0)) throw Error('FORMATION_LOCKED');
    return {
      ok: true,
      code: 'OK',
      message: 'تم حفظ التشكيل.',
      state: {
        ...state,
        party: [...command.heroIds],
        troopCells: [...command.troopCells],
        formationType: type,
      },
      balances: context.balances,
      events: [{ type: 'formation-set', amount: 1, target: type }],
    };
  }
  const type =
    command.type === 'hero-formation-upgrade'
      ? (command.formationType ?? state.formationType)
      : state.formationType;
  const level = state.formationLevels[type] ?? 0;
  const current = heroCatalog.formations.find((x) => x.type === type && x.level === level);
  if (!current) throw Error('INVALID_FORMATION');
  if (command.type === 'hero-formation-upgrade') {
    const next = heroCatalog.formations.find((x) => x.id === current.nextId);
    if (!next) throw Error('MAX_LEVEL');
    const balances = spend(context.balances, current.cost);
    return {
      ok: true,
      code: 'OK',
      message: 'تم تطوير التشكيل.',
      state: { ...state, formationLevels: { ...state.formationLevels, [type]: next.level } },
      balances,
      events: [{ type: 'formation-upgrade', amount: 1, target: type, level: next.level }],
    };
  }
  if (!current.positions.includes(command.position)) throw Error('FORMATION_POSITION_LOCKED');
  const key = `${type}:${command.position}`;
  const tier = heroCatalog.fortify.find(
    (x) =>
      x.type === type &&
      x.position === command.position &&
      x.level === (state.fortifications[key] ?? 0) + 1,
  );
  if (!tier) throw Error('MAX_LEVEL');
  if (
    tier.requirements.some(
      (id) => (heroCatalog.formations.find((x) => x.id === id)?.level ?? 999) > level,
    )
  )
    throw Error('FORMATION_LOCKED');
  const balances = spend(context.balances, tier.cost);
  return {
    ok: true,
    code: 'OK',
    message: 'تم تعزيز موضع الجيش.',
    state: { ...state, fortifications: { ...state.fortifications, [key]: tier.level } },
    balances,
    events: [{ type: 'formation-fortify', amount: 1, target: command.position, level: tier.level }],
  };
}

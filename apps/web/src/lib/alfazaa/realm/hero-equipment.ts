import { heroCatalog } from './hero-catalog';
import { reward, spend } from './hero-support';
import type { GameplayContext, GameplayResult } from './common';
import type { HeroState, HeroCommand, GearInstance } from './hero-types';
type GearCommand = Extract<
  HeroCommand,
  { type: 'hero-craft-gear' | 'hero-equip' | 'hero-equip-upgrade' }
>;
export function applyHeroEquipment(
  state: HeroState,
  command: GearCommand,
  context: GameplayContext,
): GameplayResult<HeroState> {
  if (command.type === 'hero-craft-gear') {
    const gear = heroCatalog.gear.find((x) => x.id === command.itemId);
    if (!gear) throw Error('INVALID_EQUIPMENT');
    // Independent unlock replacement for source EquipmentCollege research.
    if (context.view.castleLevel < Math.max(1, (gear.quality - 1) * 2 - 1))
      throw Error('CASTLE_REQUIRED');
    const balances = reward(spend(context.balances, gear.cost), [[gear.id, 1]]);
    return {
      ok: true,
      code: 'OK',
      message: 'صُنعت قطعة التجهيز.',
      state,
      balances,
      events: [{ type: 'craft', amount: 1, target: gear.id }],
    };
  }
  const hero = state.roster[command.heroId];
  if (!hero) throw Error('HERO_NOT_OWNED');
  if (command.type === 'hero-equip-upgrade') {
    if (!hero.equipment) throw Error('HERO_EQUIPMENT_EMPTY');
    const tier = heroCatalog.enhance.find((x) => x.level === hero.equipment!.level + 1);
    if (!tier) throw Error('MAX_LEVEL');
    const balances = spend(context.balances, tier.cost);
    const updated = { ...hero, equipment: { ...hero.equipment, level: tier.level } };
    return {
      ok: true,
      code: 'OK',
      message: 'تم تعزيز التجهيز.',
      state: { ...state, roster: { ...state.roster, [hero.id]: updated } },
      balances,
      events: [
        { type: 'equipment-upgrade', amount: 1, target: hero.equipment.itemId, level: tier.level },
      ],
    };
  }
  if (!heroCatalog.gear.some((x) => x.id === command.itemId)) throw Error('INVALID_EQUIPMENT');
  const spare = state.spareEquipment
    .filter((x) => x.itemId === command.itemId)
    .sort((a, b) => b.level - a.level)[0];
  const size = state.spareEquipment.length - (spare ? 1 : 0) + (hero.equipment ? 1 : 0);
  if (size > 200) throw Error('INVENTORY_FULL');
  const balances = spare ? context.balances : spend(context.balances, [[command.itemId, 1]]);
  if (!spare && !Number.isSafeInteger(state.nextEquipmentId + 1)) throw Error('RESOURCE_LIMIT');
  const equipped: GearInstance = spare ?? {
    id: state.nextEquipmentId,
    itemId: command.itemId,
    level: 0,
  };
  const spares = state.spareEquipment.filter((x) => x.id !== spare?.id);
  return {
    ok: true,
    code: 'OK',
    message: 'تم تجهيز البطل مع حفظ القطعة السابقة وترقيتها.',
    state: {
      ...state,
      nextEquipmentId: state.nextEquipmentId + (spare ? 0 : 1),
      spareEquipment: hero.equipment ? [...spares, hero.equipment] : spares,
      roster: { ...state.roster, [hero.id]: { ...hero, equipment: equipped } },
    },
    balances,
    events: [{ type: 'equipment-equip', amount: 1, target: command.itemId }],
  };
}

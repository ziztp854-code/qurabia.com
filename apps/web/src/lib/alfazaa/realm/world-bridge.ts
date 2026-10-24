import { advanceState, validateState, getArm, catalog, type AlfazaaState } from '../domain';
import type { Unit } from '../../kingdoms/types';
import { capacity } from '../../kingdoms/simulation';
import { advanceSharedWorld, worldCommandSchema, type SharedWorld } from './world-engine';

export function troopConversion(cfgId: number): { unit: Unit; count: number } | null {
  const arm = getArm(cfgId);
  const unit: Unit | undefined =
    arm && ({ 0: 'guard', 1: 'rider', 2: 'archer' } as Record<number, Unit>)[arm.type];
  return arm && unit ? { unit, count: Math.min(25, Math.max(1, arm.level)) } : null;
}
export function applyWorldBridge(
  state: SharedWorld,
  actor: string,
  input: AlfazaaState,
  raw: unknown,
  now: number,
) {
  const command = worldCommandSchema.parse(raw);
  if (!('expectedCityRevision' in command)) throw new Error('أمر ربط غير صالح');
  if (input.revision !== command.expectedCityRevision)
    throw new Error('تغيّرت المدينة؛ حدّث الحالة وحاول مجددًا');
  const valid = validateState(input);
  if (!valid) throw new Error('تعذّر قراءة المدينة');
  const city = advanceState(valid, now);
  const world = advanceSharedWorld(state, now);
  const village = Object.values(world.game.villages).find((v) => v.ownerId === actor);
  if (!village) throw new Error('أنشئ مخفرك أولًا');
  let nextCity = city;
  let nextVillage = village;
  if (command.type === 'convert-troop') {
    const cell = city.cells[command.cell];
    const conversion = cell?.kind === 'troop' && troopConversion(cell.cfgId);
    if (!conversion) throw new Error('اختر جنديًا متاحًا للتحويل');
    if (village.troops[conversion.unit] + conversion.count > 1e6)
      throw new Error('بلغ المخفر حد الجنود');
    nextVillage = {
      ...village,
      troops: {
        ...village.troops,
        [conversion.unit]: village.troops[conversion.unit] + conversion.count,
      },
    };
    nextCity = {
      ...city,
      cells: city.cells.map((cell, index) => (index === command.cell ? null : cell)),
    };
  } else {
    const goldId = catalog.meta.goldItemId;
    const delta = command.type === 'deposit-gold' ? command.amount : -command.amount;
    const nextGold = village.resources.gold + delta;
    const cityGold = city.balances[goldId] - delta;
    const storage = capacity(world.game, village);
    if (nextGold < 0 || cityGold < 0) throw new Error('الذهب غير كافٍ');
    if (nextGold > storage || cityGold > 1e12) throw new Error('لا تتسع سعة التخزين للتحويل');
    nextVillage = { ...village, resources: { ...village.resources, gold: nextGold } };
    nextCity = { ...city, balances: { ...city.balances, [goldId]: cityGold } };
  }
  const result = { ...nextCity, revision: input.revision + 1, updatedAt: now };
  if (!validateState(result)) throw new Error('تعذّر حفظ تحويل المدينة');
  return {
    city: result,
    world: {
      ...world,
      game: { ...world.game, villages: { ...world.game.villages, [village.id]: nextVillage } },
    },
  };
}

import type { Balances, GameplayContext, GameplayResult, Reward } from './common';
import type { SystemsState } from './systems-types';
export const LIMIT = 1_000_000_000_000;
export const riyadhDay = (now: number) => Math.floor((now + 10_800_000) / 86_400_000);
export const countValid = (n: number, max = 100) => Number.isSafeInteger(n) && n > 0 && n <= max;
export function transact(
  balances: Balances,
  cost: Reward,
  reward: Reward = [],
  count = 1,
): Balances {
  if (!countValid(count, 100_000)) throw Error('INVALID_COUNT');
  const debit: Balances = {},
    credit: Balances = {};
  for (const [entries, target] of [
    [cost, debit],
    [reward, credit],
  ] as const)
    for (const [id, amount] of entries) {
      if (
        !countValid(id, 2_147_483_647) ||
        !Number.isSafeInteger(amount) ||
        amount < 0 ||
        amount > LIMIT
      )
        throw Error('INVALID_RESOURCE');
      target[String(id)] = (target[String(id)] ?? 0) + amount * count;
      if (!Number.isSafeInteger(target[String(id)]) || target[String(id)] > LIMIT)
        throw Error('RESOURCE_LIMIT');
    }
  if (Object.entries(debit).some(([id, amount]) => (balances[id] ?? 0) < amount))
    throw Error('INSUFFICIENT_RESOURCES');
  const result = { ...balances };
  for (const id of new Set([...Object.keys(debit), ...Object.keys(credit)])) {
    const value = (balances[id] ?? 0) - (debit[id] ?? 0) + (credit[id] ?? 0);
    if (!Number.isSafeInteger(value) || value < 0 || value > LIMIT) throw Error('RESOURCE_LIMIT');
    result[id] = value;
  }
  return result;
}
const errors: Record<string, string> = {
  INSUFFICIENT_RESOURCES: 'الموارد غير كافية لإتمام الأمر.',
  REQUIREMENT: 'لم تكتمل المتطلبات بعد.',
  INVALID_RESOURCE: 'بيانات المورد غير صالحة.',
  RESOURCE_LIMIT: 'بلغ أحد الموارد الحد الأعلى؛ لم تُخصم التكلفة.',
  INVALID_COUNT: 'العدد المطلوب غير صالح.',
  UNKNOWN_COMMAND: 'هذا الأمر غير مدعوم.',
  UNKNOWN_ITEM: 'هذا العنصر غير موجود.',
  QUEUE_FULL: 'قائمة هذا النوع مشغولة. أكمل المهمة أو سرّعها أولًا.',
  ALREADY_CLAIMED: 'استلمت هذه المكافأة بالفعل.',
  QUEST_LOCKED: 'المهمة مقفلة أو لم يكتمل شرطها.',
  ITEM_NOT_USABLE: 'هذا العنصر مادة تطوير؛ استعمله في النظام المناسب.',
  DAILY_LIMIT: 'وصلت إلى الحد المسموح لهذا اليوم.',
  MAX_LEVEL: 'وصلت إلى أعلى مستوى متاح.',
  CITY_FULL: 'لا توجد خانة فارغة. الوحدات باقية في الاحتياط.',
  INVALID_TIME: 'توقيت غير متسق. أعد المزامنة.',
};
export function rejected(
  state: SystemsState,
  context: GameplayContext,
  cause: unknown,
): GameplayResult<SystemsState> {
  const code = cause instanceof Error ? cause.message : 'UNKNOWN_COMMAND';
  return {
    ok: false,
    code,
    message: errors[code] ?? 'تعذّر تنفيذ الأمر؛ لم تتغير الموارد.',
    state,
    balances: context.balances,
    events: [],
  };
}
export const accepted = (
  state: SystemsState,
  balances: Balances,
  events: GameplayResult<SystemsState>['events'] = [],
  message = 'تم حفظ التقدّم.',
): GameplayResult<SystemsState> => ({ ok: true, code: 'OK', message, state, balances, events });

import type { GameplayContext, Reward } from './common';
import type { SystemsState } from './systems-types';
import { accepted, transact } from './systems-utils';
const events = [
  {
    id: 'daily-campaign' as const,
    name: 'راية المغامرة اليومية',
    period: 'daily' as const,
    thresholds: [1, 3, 5],
    reward: (tier: number): Reward => [
      [110021, 2 * (tier + 1)],
      [110026, tier + 1],
      [400001, 1000 * (tier + 1)],
    ],
  },
  {
    id: 'weekly-commander' as const,
    name: 'قائد الأسبوع',
    period: 'weekly' as const,
    thresholds: [10, 25, 50, 100, 250],
    reward: (tier: number): Reward => [
      [800081, 5 * (tier + 1)],
      [110001, 10 * (tier + 1)],
      [420001, 10 * (tier + 1)],
    ],
  },
];
export function getEventViews(state: SystemsState) {
  return events.map((event) => {
    const cycle = event.period === 'daily' ? state.day : state.week,
      counters = event.period === 'daily' ? state.daily : state.weekly;
    const progress =
      event.period === 'daily'
        ? (counters['battle-win'] ?? 0)
        : (counters.merge ?? 0) + (counters.recruit ?? 0) + (counters['quest-claim'] ?? 0);
    const endDay = event.period === 'daily' ? state.day + 1 : (state.week + 1) * 7 - 3;
    return {
      id: event.id,
      name: event.name,
      period: event.period,
      description:
        event.period === 'daily'
          ? 'تحدٍ مستقل: انتصر في معارك الأبطال اليومية.'
          : 'تحدٍ مستقل: اجمع نقاطًا من الدمج والتجنيد واستلام المهام خلال الأسبوع.',
      progress,
      resetsAt: endDay * 86400000 - 10800000,
      tiers: event.thresholds.map((threshold, tier) => ({
        tier,
        threshold,
        reward: event.reward(tier),
        claimed: state.eventClaims.includes(`${event.id}:${cycle}:${tier}`),
        eligible:
          progress >= threshold && !state.eventClaims.includes(`${event.id}:${cycle}:${tier}`),
      })),
    };
  });
}
export function claimEvent(
  state: SystemsState,
  id: 'daily-campaign' | 'weekly-commander',
  tier: number,
  context: GameplayContext,
) {
  const event = getEventViews(state).find((e) => e.id === id),
    row = event?.tiers.find((t) => t.tier === tier);
  if (!row) throw Error('QUEST_LOCKED');
  if (row.claimed) throw Error('ALREADY_CLAIMED');
  if (!row.eligible) throw Error('QUEST_LOCKED');
  const cycle = id === 'daily-campaign' ? state.day : state.week,
    key = `${id}:${cycle}:${tier}`;
  const currentClaims = state.eventClaims.filter(
    (k) =>
      k.startsWith(`daily-campaign:${state.day}:`) ||
      k.startsWith(`weekly-commander:${state.week}:`),
  );
  return accepted(
    { ...state, eventClaims: [...currentClaims, key] },
    transact(context.balances, [], row.reward),
    [{ type: 'event-claim', amount: 1, target: tier }],
    'استلمت جائزة التحدي المستقل.',
  );
}

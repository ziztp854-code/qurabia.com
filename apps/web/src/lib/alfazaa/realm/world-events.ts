import { validateState, type AlfazaaState } from '../domain';
import { recordGameEvents } from './systems-core';
import { resourceKeys } from '../../kingdoms/types';
import type { GameEvent } from './common';
import type { SharedWorld, WorldCommand } from './world-engine';
const currency: Record<string, number> = { gold: 400001, food: 430001, wood: 450001, iron: 470001 };
export function syncWorldEvents(
  world: SharedWorld,
  actor: string,
  city: AlfazaaState,
  now: number,
  command?: WorldCommand,
) {
  const events: GameEvent[] = [];
  const joined = Boolean(world.game.players[actor]?.allianceId) && !world.questJoined?.[actor];
  if (joined) events.push({ type: 'guild-join', amount: 1 });
  const totals = world.progress[actor]?.gatheredResources ?? {};
  const synced = world.questSync?.[actor] ?? {};
  const next = Object.fromEntries(resourceKeys.map((key) => [key, Math.floor(totals[key] ?? 0)]));
  for (const key of resourceKeys) {
    const amount = next[key] - (synced[key] ?? 0);
    if (amount > 0)
      events.push({
        type: 'resource-gather',
        amount,
        ...(currency[key] ? { target: currency[key] } : {}),
      });
  }
  if (command?.type === 'alliance-donate')
    events.push(
      { type: 'guild-donate', amount: 1 },
      { type: 'guild-donated-gold', amount: command.amount },
    );
  if (command?.type === 'alliance-help') events.push({ type: 'guild-help', amount: 1 });
  if (command?.type === 'alliance-research') events.push({ type: 'guild-research', amount: 1 });
  if (command?.type === 'alliance-boss-claim')
    events.push({ type: 'guild-boss', amount: 1 }, { type: 'guild-gift-claim', amount: 1 });
  if (
    command?.type === 'outpost' &&
    command.action.type === 'march' &&
    command.action.mission === 'gather'
  )
    events.push({ type: 'gather-attempt', amount: 1 });
  if (!events.length) return { world, city };
  const state = {
    ...city,
    realm: { ...city.realm, systems: recordGameEvents(city.realm.systems, events, now) },
    revision: city.revision + 1,
    updatedAt: now,
  };
  if (!validateState(state)) throw new Error('Invalid world quest progress');
  return {
    world: {
      ...world,
      questSync: { ...world.questSync, [actor]: next },
      ...(joined ? { questJoined: { ...world.questJoined, [actor]: true as const } } : {}),
    },
    city: state,
  };
}

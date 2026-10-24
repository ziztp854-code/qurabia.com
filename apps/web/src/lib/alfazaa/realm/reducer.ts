import type { AlfazaaState, Command, CommandResult } from '../domain/types';
import type { GameEvent, GameplaySnapshot } from './common';
import { getGameplayContext } from './context';
import { advanceHeroState } from './hero-state';
import { applyHeroCommand } from './hero-core';
import { applySystemsCommand, advanceSystems } from './systems-core';
import { recordGameEvents } from './systems-state';
import { heroCommandSchema } from './hero-schema';
import { systemsCommandSchema } from './systems-schema';
import { bankProduction } from '../domain/production';
import { getSystemsSnapshot } from './systems-read';

export function applyCityEffects(state: AlfazaaState, events: GameEvent[]): AlfazaaState {
  let next = state;
  for (const event of events) {
    if (event.type === 'troop-wounded') {
      const cell = event.cell === undefined ? undefined : next.cells[event.cell];
      if (!cell || cell.kind !== 'troop' || cell.cfgId !== event.target) throw Error('INVALID_INJURY');
      next = { ...next, cells: next.cells.map((c, i) => i === event.cell ? null : c),
        realm: { ...next.realm, heroes: { ...next.realm.heroes,
          troopCells: next.realm.heroes.troopCells.filter(i => i !== event.cell) } } };
    } else if (event.type === 'troop-deploy') {
      const index = next.cells.indexOf(null);
      if (index < 0 || !event.target) throw Error('CITY_FULL');
      next = { ...next, nextId: next.nextId + 1, cells: next.cells.map((c, i) => i === index
        ? { id: String(next.nextId), kind: 'troop' as const, cfgId: event.target! } : c) };
    }
  }
  return next;
}

export function advanceRealm(state: AlfazaaState, now: number): AlfazaaState {
  const boundaries = [...new Set(state.realm.systems.jobs
    .filter(job => job.finishAt <= now && job.finishAt >= state.realm.systems.lastAt)
    .map(job => job.finishAt).concat(now))].sort((a, b) => a - b);
  let next = state;
  for (const at of boundaries) {
    const context = getGameplayContext(next, at);
    const result = advanceSystems(next.realm.systems, context);
    if (!result.ok) throw Error(result.code);
    const bonus = getSystemsSnapshot(result.state, result.balances, at).bonuses.production;
    if (bonus !== context.bonuses.production && next.lastCollectedAt <= at) {
      const settled = bankProduction(next, at, context.bonuses.production);
      const delta = (settled.balances['400001'] ?? 0) - (next.balances['400001'] ?? 0);
      next = { ...next, lastCollectedAt: settled.lastCollectedAt };
      result.balances = { ...result.balances, '400001': Math.min(1e12, (result.balances['400001'] ?? 0) + delta) };
    }
    next = applyCityEffects({ ...next, balances: result.balances, realm: { ...next.realm,
      systems: result.state } }, result.events);
  }
  return { ...next, realm: { ...next.realm, heroes: advanceHeroState(next.realm.heroes, now) } };
}

export function realmCommand(state: AlfazaaState, command: Command, now: number,
  world?: GameplaySnapshot['world']): CommandResult | null {
  if (command.type.startsWith('hero-')) {
    const parsed = heroCommandSchema.safeParse(command);
    if (!parsed.success) throw Error('INVALID_COMMAND');
    const result = applyHeroCommand(state.realm.heroes, parsed.data, getGameplayContext(state, now, world));
    if (!result.ok) return { ...result, state };
    const next = applyCityEffects({ ...state, balances: result.balances, realm: { ...state.realm,
      heroes: result.state, systems: recordGameEvents(state.realm.systems, result.events, now) } }, result.events);
    return { ...result, state: next };
  }
  if (command.type.startsWith('systems-')) {
    const parsed = systemsCommandSchema.safeParse(command);
    if (!parsed.success) throw Error('INVALID_COMMAND');
    const result = applySystemsCommand(state.realm.systems, parsed.data, getGameplayContext(state, now, world));
    if (!result.ok) return { ...result, state };
    return { ...result, state: applyCityEffects({ ...state, balances: result.balances,
      realm: { ...state.realm, systems: result.state } }, result.events) };
  }
  return null;
}

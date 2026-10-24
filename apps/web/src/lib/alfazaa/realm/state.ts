import { createHeroState, validateHeroState } from './hero-state';
import { createSystemsState, validateSystemsState } from './systems-state';
import type { RealmState } from './types';

export function createRealmState(now: number, legacy?: {
  claimed: string[]; completedTowerLevels: number[];
}): RealmState {
  const systems = createSystemsState(now);
  const claims = (legacy?.claimed ?? [])
    .filter(id => id === 'road-104' || id === 'road-301')
    .map(id => id.replace('road-', 'road:'));
  const towerWins = legacy?.completedTowerLevels.length ?? 0;
  return { rulesVersion: 1, heroes: createHeroState(now), systems: {
    ...systems, claims,
    lifetime: towerWins ? { 'tower-win': towerWins } : {},
  } };
}

export function validateRealmState(raw: unknown, at: number): RealmState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (Object.keys(value).sort().join(',') !== 'heroes,rulesVersion,systems' || value.rulesVersion !== 1)
    return null;
  const heroes = validateHeroState(value.heroes), systems = validateSystemsState(value.systems);
  if (!heroes || !systems || heroes.staminaAt > at || systems.lastAt > at ||
      (heroes.lastBattle && heroes.lastBattle.resolvedAt > at)) return null;
  return { rulesVersion: 1, heroes, systems };
}

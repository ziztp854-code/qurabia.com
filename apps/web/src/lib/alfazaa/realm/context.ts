import type { AlfazaaState } from '../domain/types';
import type { GameplayContext, GameplaySnapshot } from './common';
import { getHeroSnapshot, getCampaignCompleted } from './hero-state';
import { getSystemsSnapshot } from './systems-read';

/** Shared selector; world progress is supplied only by the authenticated server. */
export function getGameplayContext(state: AlfazaaState, now: number = state.updatedAt,
  world?: GameplaySnapshot['world']): GameplayContext {
  const systems = getSystemsSnapshot(state.realm.systems, state.balances, now);
  return { now, balances: state.balances, bonuses: systems.bonuses, view: {
    castleLevel: state.castleLevel, playerLevel: systems.playerLevel, cells: state.cells,
    heroes: getHeroSnapshot(state.realm.heroes), campaignCompleted: getCampaignCompleted(state.realm.heroes),
    research: systems.research, lifetime: systems.lifetime, daily: systems.daily,
    ...(world ? { world } : {}),
  } };
}

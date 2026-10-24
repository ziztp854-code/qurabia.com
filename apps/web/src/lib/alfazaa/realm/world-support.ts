import type { AlfazaaState } from '../domain';
import { createCommander } from '../../kingdoms/commanders';
import type { SharedWorld } from './world-engine';

/** Independent rule: castle + strongest owned hero grant at most 30% guard support. No free troops. */
export function syncCitySupport(
  input: SharedWorld,
  actor: string,
  city: AlfazaaState,
): SharedWorld {
  const village = Object.values(input.game.villages).find((v) => v.ownerId === actor);
  if (!village) return input;
  const id = `afz-support-${village.id}`;
  const previous = input.game.commanders?.[id];
  if (previous && !['available', 'assigned'].includes(previous.status)) return input;
  const heroLevel = Math.max(0, ...Object.values(city.realm.heroes.roster).map((h) => h.level));
  const bonus = Math.min(30, city.castleLevel + Math.floor(heroLevel / 5));
  const commander = {
    ...(previous ?? createCommander(input.game, id, actor, 'إسناد أبطال المدينة', 'infantry')),
    attack: bonus,
    defense: bonus,
    mobility: 0,
    logistics: 0,
    siege: 0,
    ...(!village.commanderId || village.commanderId === id
      ? { status: 'assigned' as const, villageId: village.id, homeVillageId: village.id }
      : {}),
  };
  return {
    ...input,
    game: {
      ...input.game,
      commanders: { ...input.game.commanders, [id]: commander },
      villages: {
        ...input.game.villages,
        [village.id]: { ...village, commanderId: village.commanderId ?? id },
      },
    },
  };
}

import { bigStar, findHero, heroCatalog } from './hero-catalog';
import type { HeroState } from './hero-types';
export function getHeroStats(state: HeroState, heroId: number) {
  const hero = state.roster[heroId],
    definition = findHero(heroId);
  if (!hero || !definition) return null;
  const star = definition.starAttr[hero.star] ?? [0, 0, 0];
  const equipment = hero.equipment && heroCatalog.gear.find((x) => x.id === hero.equipment!.itemId);
  const enhanced = hero.equipment
    ? heroCatalog.enhance.find((x) => x.level === hero.equipment!.level)
    : undefined;
  const potency = 1 + (enhanced?.attrAdd ?? 0) / 10000;
  const values = definition.base.map(
    (base, axis) => base + (definition.growth[axis] ?? 0) * (hero.level - 1) + (star[axis] ?? 0),
  );
  return {
    attack: Math.floor(values[0] * (1 + (equipment?.bonuses.attack ?? 0) * potency)),
    defense: Math.floor(values[1] * (1 + (equipment?.bonuses.defense ?? 0) * potency)),
    command: Math.floor(values[2] * (1 + (equipment?.bonuses.health ?? 0) * potency)),
    maxLevel: heroCatalog.levelCaps[bigStar(hero.star)],
    visibleStars: bigStar(hero.star),
  };
}

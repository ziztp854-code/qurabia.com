export {
  createHeroState,
  validateHeroState,
  advanceHeroState,
  getHeroSnapshot,
  getCampaignCompleted,
} from './hero-state';
export { getHeroCatalog } from './hero-catalog';
export { getHeroStats } from './hero-stats';
import type { GameplayContext, GameplayResult } from './common';
import type { HeroState, HeroCommand } from './hero-types';
import { heroCommandSchema } from './hero-schema';
import { advanceHeroState, newOwnedHero } from './hero-state';
import { bigStar, findHero, heroCatalog } from './hero-catalog';
import { spend, validBalances } from './hero-support';
import type { OwnedHero } from './hero-types';
import { applyHeroSkill } from './hero-skills';
import { applyHeroEquipment } from './hero-equipment';
import { applyHeroFormation } from './hero-formation';
import { applyHeroBattle } from './hero-battles';
function levelWithXp(hero: OwnedHero): OwnedHero {
  const definition = findHero(hero.id)!;
  const cap = heroCatalog.levelCaps[bigStar(hero.star)];
  let { level, xp } = hero;
  while (level < cap) {
    const needed = heroCatalog.levelCosts[String(definition.rarity)]?.[String(level)];
    if (!needed || xp < needed) break;
    xp -= needed;
    level++;
  }
  return { ...hero, level, xp };
}
function execute(
  state: HeroState,
  command: HeroCommand,
  context: GameplayContext,
): GameplayResult<HeroState> {
  const next = advanceHeroState(state, context.now);
  if (command.type === 'hero-recruit') {
    const definition = findHero(command.heroId);
    if (!definition) throw Error('INVALID_HERO');
    if (next.roster[command.heroId]) throw Error('HERO_OWNED');
    const balances = spend(context.balances, [[definition.fragment, definition.mergeCost]]);
    return {
      ok: true,
      code: 'OK',
      message: 'انضم البطل إلى جيشك.',
      state: {
        ...next,
        roster: { ...next.roster, [command.heroId]: newOwnedHero(command.heroId) },
      },
      balances,
      events: [{ type: 'hero-recruit', amount: 1, target: command.heroId }],
    };
  }
  if (command.type === 'hero-train') {
    const hero = next.roster[command.heroId];
    if (!hero) throw Error('HERO_NOT_OWNED');
    const experience = heroCatalog.expItems[String(command.itemId)];
    if (!experience) throw Error('INVALID_ITEM');
    if (hero.level >= heroCatalog.levelCaps[bigStar(hero.star)]) throw Error('HERO_LEVEL_CAP');
    const balances = spend(context.balances, [[command.itemId, command.count]]);
    const updated = levelWithXp({ ...hero, xp: hero.xp + experience * command.count });
    return {
      ok: true,
      code: 'OK',
      message: 'تم تدريب البطل.',
      state: { ...next, roster: { ...next.roster, [hero.id]: updated } },
      balances,
      events: [
        { type: 'item-use', amount: command.count, target: command.itemId },
        { type: 'hero-exp', amount: experience * command.count, target: hero.id },
        {
          type: 'hero-level',
          amount: updated.level - hero.level,
          target: hero.id,
          level: updated.level,
        },
      ],
    };
  }
  if (command.type === 'hero-star') {
    const hero = next.roster[command.heroId],
      definition = findHero(command.heroId);
    if (!hero || !definition) throw Error('HERO_NOT_OWNED');
    const cost = definition.starCost[hero.star];
    if (!cost) throw Error('HERO_MAX_STAR');
    const balances = spend(context.balances, [[definition.fragment, cost]]);
    const star = hero.star + 1;
    const skills = [...hero.skills];
    skills[0] = {
      id: definition.skillTiers[Math.min(4, Math.floor(star / 5))]?.[0] ?? definition.skill.id,
      level: bigStar(star),
      xp: 0,
    };
    const updated = levelWithXp({ ...hero, star, skills });
    return {
      ok: true,
      code: 'OK',
      message: 'ارتفعت نجوم البطل.',
      state: { ...next, roster: { ...next.roster, [hero.id]: updated } },
      balances,
      events: [
        { type: 'hero-star', amount: 1, target: hero.id, level: bigStar(star) },
        {
          type: 'hero-level',
          amount: updated.level - hero.level,
          target: hero.id,
          level: updated.level,
        },
      ],
    };
  }
  if (command.type === 'hero-skill' || command.type === 'hero-skill-forget')
    return applyHeroSkill(next, command, context);
  if (
    command.type === 'hero-craft-gear' ||
    command.type === 'hero-equip' ||
    command.type === 'hero-equip-upgrade'
  )
    return applyHeroEquipment(next, command, context);
  if (
    command.type === 'hero-formation' ||
    command.type === 'hero-formation-upgrade' ||
    command.type === 'hero-fortify'
  )
    return applyHeroFormation(next, command, context);
  if (command.type === 'hero-battle' || command.type === 'hero-rest')
    return applyHeroBattle(next, command, context);
  throw Error('INVALID_COMMAND');
}
const messages: Record<string, string> = {
  INSUFFICIENT_RESOURCES: 'الموارد أو الشظايا غير كافية.',
  HERO_OWNED: 'البطل مملوك بالفعل.',
  HERO_NOT_OWNED: 'جنّد البطل أولًا.',
  HERO_LEVEL_CAP: 'ارفع نجوم البطل لفتح مستويات إضافية.',
  INVALID_TIME: 'توقيت غير متسق؛ أعد المزامنة.',
  RESOURCE_LIMIT: 'بلغ أحد الموارد الحد الأقصى.',
};
export function applyHeroCommand(
  state: HeroState,
  command: HeroCommand,
  context: GameplayContext,
): GameplayResult<HeroState> {
  try {
    if (!heroCommandSchema.safeParse(command).success || !validBalances(context.balances))
      throw Error('INVALID_COMMAND');
    return execute(state, command, context);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'INVALID_COMMAND';
    return {
      ok: false,
      code,
      message: messages[code] ?? 'تعذر تنفيذ أمر البطل. راجع الشروط والتكلفة.',
      state,
      balances: context.balances,
      events: [],
    };
  }
}

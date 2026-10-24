import { bigStar, findHero, heroCatalog } from './hero-catalog';
import { reward, spend } from './hero-support';
import type { GameplayContext, GameplayResult, Reward } from './common';
import type { HeroState, HeroCommand } from './hero-types';
type SkillCommand = Extract<HeroCommand, { type: 'hero-skill' | 'hero-skill-forget' }>;
export function applyHeroSkill(
  state: HeroState,
  command: SkillCommand,
  context: GameplayContext,
): GameplayResult<HeroState> {
  const hero = state.roster[command.heroId],
    definition = findHero(command.heroId);
  if (!hero || !definition) throw Error('HERO_NOT_OWNED');
  if (command.slot === 0) throw Error('HERO_BORN_SKILL');
  if (hero.level < heroCatalog.skillUnlocks[command.slot]) throw Error('HERO_SKILL_LOCKED');
  const current = hero.skills[command.slot];
  const skills = [...hero.skills];
  let balances = context.balances;
  if (command.type === 'hero-skill-forget') {
    if (!current) throw Error('HERO_SKILL_EMPTY');
    const invested =
      heroCatalog.skills
        .filter((x) => x.id === current.id && x.level < current.level)
        .reduce((sum, x) => sum + x.exp, 0) + current.xp;
    const gain: Reward = [[current.id, 1]];
    const books = Math.floor((invested * 0.6) / 30);
    if (books) gain.push([110026, books]);
    balances = reward(balances, gain);
    skills[command.slot] = null;
  } else if (!current) {
    const skillId = command.skillId ?? definition.recommended[command.slot - 1];
    if (!definition.recommended.includes(skillId) || hero.skills.some((x) => x?.id === skillId))
      throw Error('INVALID_SKILL');
    balances = spend(balances, [[skillId, 1]]);
    skills[command.slot] = { id: skillId, level: 1, xp: 0 };
  } else {
    if (command.skillId !== undefined && command.skillId !== current.id)
      throw Error('HERO_SKILL_OCCUPIED');
    const cap = heroCatalog.skillCaps[bigStar(hero.star)];
    const next = heroCatalog.skills.find(
      (x) => x.id === current.id && x.level === current.level + 1,
    );
    const needed = heroCatalog.skills.find(
      (x) => x.id === current.id && x.level === current.level,
    )?.exp;
    if (!next || !needed || current.level >= cap) throw Error('HERO_SKILL_CAP');
    const books = Math.max(0, Math.ceil((needed - current.xp) / 30));
    balances = spend(balances, [[110026, books]]);
    skills[command.slot] = {
      id: current.id,
      level: current.level + 1,
      xp: current.xp + books * 30 - needed,
    };
  }
  return {
    ok: true,
    code: 'OK',
    message:
      command.type === 'hero-skill-forget'
        ? 'أُعيد كتاب المهارة وجزء من خبرتها.'
        : 'تم تطوير مهارة البطل.',
    state: { ...state, roster: { ...state.roster, [hero.id]: { ...hero, skills } } },
    balances,
    events: [
      {
        type: command.type === 'hero-skill-forget' ? 'hero-skill-forget' : 'hero-skill',
        amount: 1,
        target: skills[command.slot]?.id ?? current?.id,
        level: skills[command.slot]?.level ?? 0,
      },
    ],
  };
}

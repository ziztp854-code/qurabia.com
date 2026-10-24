import { findHero, heroCatalog } from './hero-catalog';
import { getHeroStats } from './hero-stats';
import type { StageDefinition } from './hero-catalog';
import type { GameplayContext } from './common';
import type { BattleUnit, BattleEvent, HeroState, HeroBattleReport } from './hero-types';
type Fighter = BattleUnit & {
  shield: number;
  poison: number;
  stun: number;
  weaken: number;
  buff: number;
};
const bounded = (n: number) => Math.max(0, Math.min(1e12, Math.floor(n)));
function buildUnits(state: HeroState, stage: StageDefinition, context: GameplayContext): Fighter[] {
  const cells = state.troopCells.length
    ? state.troopCells
    : context.view.cells.flatMap((x, i) => (x?.kind === 'troop' ? [i] : [])).slice(0, 9);
  if (!cells.length) throw Error('NO_ARMY');
  const commanders = state.party.map((id) => getHeroStats(state, id)!);
  const attack = commanders.reduce((n, h) => n + h.attack, 0) / 100;
  const defense = commanders.reduce((n, h) => n + h.defense, 0) / 100;
  const health = commanders.reduce((n, h) => n + h.command, 0) / 100;
  const formation = (state.formationLevels[String(state.formationType)] ?? 0) * 0.02;
  const learned = state.party
    .flatMap((id) => state.roster[id].skills.slice(1))
    .reduce((n, s) => n + (s?.level ?? 0) * 0.005, 0);
  const make = (
    cfgId: number,
    side: 'player' | 'enemy',
    index: number,
    cell: number | null,
    count = 1,
  ): Fighter => {
    const cfg = heroCatalog.arms.find((a) => a.id === cfgId);
    if (!cfg) throw Error('INVALID_ARMY');
    const player = side === 'player';
    const boost = (type: number) => (player && state.formationType === type ? 1 + formation : 1);
    const hp = bounded(
      cfg.health *
        Math.max(1, count) *
        (player
          ? (1 + health) *
            (1 + context.bonuses.health) *
            (1 + (state.fortifications[`${state.formationType}:${index}`] ?? 0) * 0.01)
          : 1) *
        boost(3),
    );
    return {
      id: `${side}-${index}`,
      side,
      cfgId,
      hp: Math.max(1, hp),
      maxHp: Math.max(1, hp),
      attack: bounded(
        cfg.attack *
          Math.max(1, count) *
          (player ? (1 + attack + learned) * (1 + context.bonuses.attack) : 1) *
          boost(1),
      ),
      defense: bounded(
        (cfg.defense + (player ? defense : 0)) *
          (player ? 1 + context.bonuses.defense : 1) *
          boost(2),
      ),
      speed: bounded(cfg.speed * boost(4)),
      cell,
      shield: 0,
      poison: 0,
      stun: 0,
      weaken: 0,
      buff: 0,
    };
  };
  const players = cells.map((cell, i) => {
    const troop = context.view.cells[cell];
    if (troop?.kind !== 'troop') throw Error('INVALID_ARMY');
    return make(troop.cfgId, 'player', i, cell);
  });
  // Source special/wall stages have no deployable lineup; documented NPC fallback.
  const enemy = stage.enemy.length
    ? stage.enemy
    : [[0, 10001, 1 + Math.floor((stage.stage ?? stage.id) / 2)]];
  return [...players, ...enemy.slice(0, 9).map((row, i) => make(row[1], 'enemy', i, null, row[2]))];
}
export function resolveHeroBattle(
  state: HeroState,
  stage: StageDefinition,
  context: GameplayContext,
): Pick<HeroBattleReport, 'units' | 'events' | 'turns' | 'won' | 'logTruncated' | 'injuries'> {
  const units = buildUnits(state, stage, context),
    events: BattleEvent[] = [];
  let seed = (context.now + state.battleCounter * 2654435761 + stage.id) >>> 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let logTruncated = false,
    turns = 0;
  const alive = (side: 'player' | 'enemy') => units.filter((u) => u.side === side && u.hp > 0);
  const log = (event: BattleEvent) => {
    if (events.length < 120) events.push(event);
    else logTruncated = true;
  };
  const damage = (
    actor: Fighter,
    target: Fighter,
    amount: number,
    kind: BattleEvent['kind'],
    heroId?: number,
  ) => {
    const raw = Math.max(1, bounded(amount)),
      absorbed = Math.min(target.shield, raw);
    target.shield -= absorbed;
    const dealt = Math.min(target.hp, raw - absorbed);
    target.hp -= dealt;
    log({
      turn: turns,
      actor: actor.id,
      target: target.id,
      kind,
      amount: dealt,
      remaining: target.hp,
      ...(heroId ? { heroId } : {}),
    });
    if (!target.hp)
      log({
        turn: turns,
        actor: actor.id,
        target: target.id,
        kind: 'defeat',
        amount: 0,
        remaining: 0,
      });
  };
  const skill = (heroId: number) => {
    const definition = findHero(heroId)!;
    const effect = definition.skill;
    if (turns % Math.max(1, effect.cadence) !== 0 || random() > Math.min(1, effect.chance / 10000))
      return;
    const actor = alive('player')[0];
    if (!actor) return;
    const friendly =
      effect.effect === 'heal' || effect.effect === 'shield' || effect.effect === 'buff';
    const targets = alive(friendly ? 'player' : 'enemy')
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)
      .slice(0, Math.max(1, Math.min(3, effect.targets[0] ?? 1)));
    for (const target of targets) {
      if (effect.effect === 'strike') {
        damage(
          actor,
          target,
          actor.attack * Math.max(0.25, effect.percent / 10000),
          'strike',
          heroId,
        );
        continue;
      }
      let amount = 0;
      if (effect.effect === 'heal') {
        amount = Math.min(target.maxHp - target.hp, Math.max(1, Math.floor(target.maxHp * 0.12)));
        target.hp += amount;
      }
      if (effect.effect === 'shield') {
        amount = Math.max(1, Math.floor(target.maxHp * 0.15));
        target.shield = Math.min(1e12, target.shield + amount);
      }
      if (effect.effect === 'poison') target.poison = 2;
      if (effect.effect === 'stun') target.stun = 1;
      if (effect.effect === 'weaken') target.weaken = 2;
      if (effect.effect === 'buff') target.buff = 2;
      log({
        turn: turns,
        actor: actor.id,
        target: target.id,
        kind: effect.effect,
        amount,
        remaining: target.hp,
        heroId,
      });
    }
  };
  for (turns = 1; turns <= 40; turns++) {
    state.party.forEach(skill);
    for (const actor of [...units].sort((a, b) => b.speed - a.speed || a.id.localeCompare(b.id))) {
      if (actor.hp <= 0) continue;
      if (actor.poison > 0) {
        actor.poison--;
        damage(actor, actor, actor.maxHp * 0.05, 'poison');
        if (!actor.hp) continue;
      }
      if (actor.stun > 0) {
        actor.stun--;
        continue;
      }
      const targets = alive(actor.side === 'player' ? 'enemy' : 'player');
      if (!targets.length) break;
      const target = targets[Math.floor(random() * targets.length)];
      damage(
        actor,
        target,
        actor.attack *
          (actor.buff > 0 ? 1.15 : 1) *
          (actor.weaken > 0 ? 0.8 : 1) *
          (0.95 + random() * 0.1) -
          target.defense * 0.35,
        'attack',
      );
      actor.buff = Math.max(0, actor.buff - 1);
      actor.weaken = Math.max(0, actor.weaken - 1);
    }
    if (!alive('enemy').length || !alive('player').length) break;
  }
  return {
    units: units.map((u) => ({
      id: u.id,
      side: u.side,
      cfgId: u.cfgId,
      hp: u.hp,
      maxHp: u.maxHp,
      attack: u.attack,
      defense: u.defense,
      speed: u.speed,
      cell: u.cell,
    })),
    events,
    turns: Math.min(40, turns),
    won: alive('enemy').length === 0 && alive('player').length > 0,
    logTruncated,
    injuries: units
      .filter((u) => u.side === 'player' && !u.hp && u.cell !== null)
      .map((u) => ({ cell: u.cell!, cfgId: u.cfgId })),
  };
}

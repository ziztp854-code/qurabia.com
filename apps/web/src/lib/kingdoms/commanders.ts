import { defaultCommanderConfig } from './commander-config';
import {
  unitKeys,
  type Commander,
  type CommanderConfig,
  type CommanderSpecialization,
  type CommanderView,
  type KingdomsWorld,
  type Troops,
} from './types';

export const commanderConfig = (world: KingdomsWorld) =>
  world.config.commanders ?? defaultCommanderConfig;

/** Additive initialization on the engine's fresh clone; existing villages and queues are untouched. */
export function normalizeCommanders(world: KingdomsWorld) {
  world.config = { ...world.config, commanders: commanderConfig(world) };
  world.commanders = world.commanders ?? {};
  world.commanderAwards = world.commanderAwards ?? [];
}
export function experienceForLevel(config: CommanderConfig, level: number): number {
  let experience = 0;
  for (let next = 2; next <= Math.min(level, config.maxLevel); next++) {
    experience += Math.ceil(config.xpBase * config.xpGrowth ** (next - 2));
  }
  return experience;
}
export function createCommander(
  world: KingdomsWorld,
  id: string,
  playerId: string,
  name: string,
  specialization: CommanderSpecialization,
): Commander {
  const base = commanderConfig(world).statBase;
  return {
    id,
    playerId,
    name,
    specialization,
    level: 1,
    experience: 0,
    attack: base,
    defense: base,
    mobility: base,
    siege: base,
    logistics: base,
    status: 'available',
  };
}
export function projectCommanders(world: KingdomsWorld, playerId: string): CommanderView[] {
  const config = commanderConfig(world);
  return Object.values(world.commanders ?? {})
    .filter((c) => c.playerId === playerId)
    .map((c) => ({
      ...c,
      rankKey: [...config.ranks].reverse().find((rank) => rank.minLevel <= c.level)!.key,
      nextLevelExperience:
        c.level >= config.maxLevel ? null : experienceForLevel(config, c.level + 1),
    }));
}
export function availableCommander(
  world: KingdomsWorld,
  playerId: string,
  commanderId: string,
  at: number,
): Commander {
  const commander = world.commanders?.[commanderId];
  if (!commander || commander.playerId !== playerId) throw new Error('commander.error.notOwned');
  if (!['available', 'assigned'].includes(commander.status) || (commander.cooldownUntil ?? 0) > at)
    throw new Error('commander.error.unavailable');
  return commander;
}
/** Bonuses multiply only real supported units, never add an independent commander attack. */
export function commanderCombatPower(
  world: KingdomsWorld,
  troops: Troops,
  stat: 'attack' | 'defense',
  commander?: Commander,
): number {
  const unitPower = (unit: typeof unitKeys[number]) => {
    const count = troops[unit] ?? 0;
    return count === 0 ? 0 : count * world.config.units[unit][stat];
  };
  const base = unitKeys.reduce(
    (sum, unit) => sum + unitPower(unit),
    0,
  );
  if (!commander) return base;
  const config = commanderConfig(world);
  const relevant =
    commander.specialization === 'cavalry'
      ? ['rider']
      : commander.specialization === 'infantry'
        ? ['guard']
        : commander.specialization === 'defense' && stat === 'defense'
          ? [...unitKeys]
          : [];
  const supportedPower = unitKeys
    .filter((unit) => relevant.includes(unit))
    .reduce((sum, unit) => sum + unitPower(unit), 0);
  const bonus = Math.min(config.maxBonus, Math.max(0, commander[stat] / 100));
  return base + supportedPower * bonus;
}
export function setCommander(world: KingdomsWorld, commander: Commander) {
  world.commanders = { ...world.commanders, [commander.id]: commander };
}
export function releaseCommander(
  world: KingdomsWorld,
  commanderId: string | undefined,
  at: number,
  defeated = false,
) {
  const commander = commanderId ? world.commanders?.[commanderId] : undefined;
  if (!commander) return;
  const { villageId: _village, homeVillageId: _home, ...available } = commander;
  void _village;
  void _home;
  setCommander(world, {
    ...available,
    status: 'available',
    cooldownUntil: defeated ? at + commanderConfig(world).recoverySeconds * 1000 : at,
  });
}
export function addCommanderExperience(world: KingdomsWorld, commanderId: string, amount: number) {
  const commander = world.commanders?.[commanderId];
  if (!commander || amount <= 0) return;
  const config = commanderConfig(world);
  const experience = Math.min(
    experienceForLevel(config, config.maxLevel),
    commander.experience + amount,
  );
  let level = 1;
  while (level < config.maxLevel && experience >= experienceForLevel(config, level + 1)) level++;
  const value = config.statBase + (level - 1) * config.statPerLevel;
  setCommander(world, {
    ...commander,
    level,
    experience,
    attack: value,
    defense: value,
    mobility: value,
    siege: value,
    logistics: value,
  });
}
export function awardBattleExperience(
  world: KingdomsWorld,
  eventId: string,
  at: number,
  attackerId: string,
  defenderId: string,
  attackerCommanderId: string | undefined,
  defenderCommanders: { commanderId: string; casualties: number }[],
  attackerLoss: number,
  defenderLoss: number,
  attackerWon: boolean,
) {
  const config = commanderConfig(world);
  if (attackerId === defenderId || Math.min(attackerLoss, defenderLoss) < config.minCasualties)
    return;
  const participants = [
    {
      playerId: attackerId,
      opponentId: defenderId,
      commanderIds: attackerCommanderId ? [attackerCommanderId] : [],
      won: attackerWon,
      enemyLoss: defenderLoss,
    },
  ];
  for (const contingent of defenderCommanders) {
    const commander = world.commanders?.[contingent.commanderId];
    if (
      !commander ||
      commander.playerId === attackerId ||
      contingent.casualties < config.minCasualties
    )
      continue;
    const existing = participants.find(
      (participant) => participant.playerId === commander.playerId,
    );
    if (existing) existing.commanderIds.push(commander.id);
    else
      participants.push({
        playerId: commander.playerId,
        opponentId: attackerId,
        commanderIds: [commander.id],
        won: !attackerWon,
        enemyLoss: attackerLoss,
      });
  }
  // Every player gets a single award per battle, shared across their participating commanders.
  for (const participant of participants) {
    const ids = [...new Set(participant.commanderIds)].filter(
      (id) => world.commanders?.[id]?.playerId === participant.playerId,
    );
    if (!ids.length) continue;
    const awards = (world.commanderAwards ?? []).filter(
      (entry) =>
        entry.at > at - Math.max(config.xpWindowSeconds, config.pairCooldownSeconds) * 1000,
    );
    const history = awards.filter((entry) => entry.playerId === participant.playerId);
    if (
      history.some(
        (entry) =>
          entry.eventId === eventId ||
          (entry.opponentId === participant.opponentId &&
            entry.at > at - config.pairCooldownSeconds * 1000),
      )
    )
      continue;
    const used = history
      .filter((entry) => entry.at > at - config.xpWindowSeconds * 1000)
      .reduce((sum, entry) => sum + entry.xp, 0);
    const xp = Math.min(
      config.xpWindowCap - used,
      config.battleXp +
        (participant.won ? config.victoryXp : 0) +
        participant.enemyLoss * config.casualtyXp,
    );
    if (xp <= 0) continue;
    world.commanderAwards = [
      ...awards,
      { eventId, playerId: participant.playerId, opponentId: participant.opponentId, at, xp },
    ];
    ids.forEach((id) => addCommanderExperience(world, id, Math.floor(xp / ids.length)));
  }
}

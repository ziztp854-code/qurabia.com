import { z } from 'zod';
import { commanderSpecializations, resourceKeys, type CommanderConfig } from './types';

export const defaultCommanderConfig: CommanderConfig = {
  maxPerPlayer: 3,
  maxLevel: 50,
  recruitmentCost: { wood: 100, stone: 100, iron: 100, food: 100, gold: 50 },
  maxBonus: 0.15,
  xpBase: 100,
  xpGrowth: 1.15,
  statBase: 5,
  statPerLevel: 1,
  ranks: [
    { minLevel: 1, key: 'commander.rank.mamluk' },
    { minLevel: 10, key: 'commander.rank.amirTen' },
    { minLevel: 20, key: 'commander.rank.tablkhana' },
    { minLevel: 35, key: 'commander.rank.amirHundred' },
    { minLevel: 50, key: 'commander.rank.atabek' },
  ],
  specializations: Object.fromEntries(
    commanderSpecializations.map((key) => [key, { key: `commander.specialization.${key}` }]),
  ) as CommanderConfig['specializations'],
  battleXp: 20,
  victoryXp: 10,
  casualtyXp: 2,
  minCasualties: 5,
  pairCooldownSeconds: 21600,
  xpWindowSeconds: 86400,
  xpWindowCap: 200,
  recoverySeconds: 3600,
  questXp: 30,
};
const integer = z.number().int().min(1).max(1e6);
const key = z
  .string()
  .regex(/^commander\.[a-zA-Z.]+$/)
  .max(100);
export const commanderConfigSchema = z
  .object({
    maxPerPlayer: integer.max(10),
    maxLevel: integer.max(50),
    recruitmentCost: z
      .object(
        Object.fromEntries(
          resourceKeys.map((r) => [r, z.number().finite().min(0).max(1e9)]),
        ) as Record<(typeof resourceKeys)[number], z.ZodNumber>,
      )
      .strict(),
    maxBonus: z.number().finite().min(0).max(0.15),
    xpBase: integer,
    xpGrowth: z.number().finite().min(1.01).max(2),
    statBase: integer.max(100),
    statPerLevel: integer.max(10),
    ranks: z
      .array(z.object({ minLevel: integer.max(50), key }).strict())
      .min(1)
      .max(10),
    specializations: z.record(z.enum(commanderSpecializations), z.object({ key }).strict()),
    battleXp: integer,
    victoryXp: integer,
    casualtyXp: integer,
    minCasualties: integer,
    pairCooldownSeconds: integer.min(3600),
    xpWindowSeconds: integer.min(3600),
    xpWindowCap: integer,
    recoverySeconds: integer.min(60),
    questXp: integer,
  })
  .strict()
  .superRefine((config, context) => {
    let maximumExperience = 0;
    for (let level = 2; level <= config.maxLevel; level++)
      maximumExperience += Math.ceil(config.xpBase * config.xpGrowth ** (level - 2));
    if (!Number.isSafeInteger(maximumExperience))
      context.addIssue({
        code: 'custom',
        message: 'Commander experience thresholds must be safe integers',
      });
    if (
      config.ranks[0].minLevel !== 1 ||
      config.ranks.some(
        (rank, index) =>
          rank.minLevel > config.maxLevel ||
          (index > 0 && rank.minLevel <= config.ranks[index - 1].minLevel),
      )
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Commander ranks must start at level 1 and increase within the level cap',
      });
    }
    if (!resourceKeys.some((r) => config.recruitmentCost[r] > 0))
      context.addIssue({
        code: 'custom',
        message: 'Commander recruitment must have a resource cost',
      });
  })
  .default(defaultCommanderConfig);

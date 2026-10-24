import researchData from './data/systems-research.json';
import economyData from './data/systems-economy.json';
import questData from './data/systems-quests.json';
import progressionData from './data/systems-progression.json';
import type { Reward } from './common';
import type { QuestFamily, ResearchTree } from './systems-types';
export interface ResearchRow {
  id: number;
  key: string;
  tree: ResearchTree;
  type: number;
  level: number;
  name: string;
  description: string;
  castle: number;
  playerLevel: number;
  requires: unknown[];
  buildingType: number;
  next: number;
  previous: number;
  value: number;
  cost: Reward;
  seconds: number;
  xp: number;
  image: string;
}
export interface ItemRow {
  id: number;
  name: string;
  type: number;
  subtype: number;
  quality: number;
  level: number;
  image: string;
  description: string;
  useNeed: Reward;
  useGain: number;
  merge: number;
  price: Reward;
  speedSeconds: number;
  selectable: boolean;
}
export interface DropRow {
  id: number;
  type: number;
  rewards: number[][];
  draws: number;
  nested: (number | number[])[];
}
export interface RecipeRow {
  id: number;
  type: number;
  reward: Reward;
  cost: Reward;
}
export interface ShopRow {
  id: number;
  type: number;
  limitType: number;
  limit: number;
  cost: Reward;
  reward: Reward;
  minLevel: number;
  maxLevel: number;
  allianceLevel: number;
  vip: number;
  order: number;
}
export interface ArmRow {
  id: number;
  name: string;
  type: number;
  subtype: number;
  level: number;
  cost: Reward;
  seconds: number;
  healSeconds: number;
  healCost: Reward;
  xp: number;
}
export interface IdentityRow {
  level: number;
  xp: number;
  dailyGold: number;
  dailyXp: number;
  dailyDrop: number;
  shopGold: number;
}
export interface QuestRow {
  id: number;
  family: QuestFamily;
  type: number;
  target: number;
  goal: number;
  name: string;
  description: string;
  reward: Reward;
  cost: Reward;
  castle: number;
  minLevel: number;
  maxLevel: number;
  multiplier: number;
  group: number;
  order: number;
  chapter: number;
  chapterReward: boolean;
}
export const systemsCatalog = {
  research: researchData.research as unknown as ResearchRow[],
  items: economyData.items as unknown as ItemRow[],
  drops: economyData.drops as unknown as DropRow[],
  choices: economyData.choices as { id: number; rewards: Reward }[],
  recipes: economyData.recipes as unknown as RecipeRow[],
  shops: economyData.shops as unknown as ShopRow[],
  arms: economyData.arms as unknown as ArmRow[],
  identity: economyData.identity as IdentityRow[],
  quests: questData.quests as unknown as QuestRow[],
  beasts: progressionData.beasts as {
    id: number;
    name: string;
    cost: Reward;
    seconds: number;
    feedCost: Reward;
    image: string;
  }[],
  destroyers: progressionData.destroyers as {
    id: number;
    level: number;
    cost: Reward;
    xp: number;
    attack: number;
    health: number;
  }[],
  relics: progressionData.relics as {
    id: number;
    name: string;
    slot: number;
    group: number;
    decompose: Reward;
    health: number;
    attack: number;
  }[],
  relicLevels: progressionData.relicLevels as {
    id: number;
    group: number;
    level: number;
    cost: Reward;
  }[],
  dailyThresholds: questData.dailyThresholds,
  dailyBoxes: questData.dailyBoxes,
};
export const getSystemsCatalog = () => systemsCatalog;
export const researchRow = (tree: ResearchTree, id: number) =>
  systemsCatalog.research.find((r) => r.tree === tree && r.id === id);
export const itemRow = (id: number) => systemsCatalog.items.find((r) => r.id === id);
export const armRow = (id: number) => systemsCatalog.arms.find((r) => r.id === id);
export const isPlayableArm = (row: ArmRow | undefined): row is ArmRow =>
  !!row && row.subtype === 1 && [0, 1, 2].includes(row.type);
export const getPlayerLevel = (balances: Record<string, number>) => {
  let xp = balances['1200001'] ?? 0;
  let level = 1;
  for (const row of systemsCatalog.identity) {
    if (row.level !== level || row.xp <= 0 || xp < row.xp) break;
    xp -= row.xp;
    level++;
  }
  return Math.min(level, systemsCatalog.identity.at(-1)?.level ?? level);
};
export const identityRow = (level: number) =>
  systemsCatalog.identity.find((r) => r.level === level) ?? systemsCatalog.identity[0];

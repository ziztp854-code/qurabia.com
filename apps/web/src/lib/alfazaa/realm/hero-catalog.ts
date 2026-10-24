import heroData from './data/hero-gameplay.json';
import progressionData from './data/hero-progression.json';
import campaignData from './data/campaign-gameplay.json';
import type { HeroDefinition, HeroBattleMode } from './hero-types';
import type { Reward } from './common';
export interface GearDefinition {
  id: number;
  name: string;
  quality: number;
  cost: Reward;
  split: Reward;
  bonuses: { attack: number; defense: number; health: number };
}
export interface FormationDefinition {
  id: number;
  type: number;
  level: number;
  nextId: number;
  cost: Reward;
  positions: number[];
  power: number;
}
export interface FortificationDefinition {
  id: number;
  type: number;
  position: number;
  level: number;
  requirements: number[];
  cost: Reward;
  power: number;
}
export interface BattleArmDefinition {
  id: number;
  type: number;
  level: number;
  attack: number;
  defense: number;
  health: number;
  speed: number;
}
export interface StageDefinition {
  id: number;
  reward: Reward;
  enemy: number[][];
  nextId?: number;
  chapter?: number;
  stage?: number;
  chapterReward?: Reward;
  minCastle?: number;
  minPlayer?: number;
}
const heroes = heroData.heroes as unknown as HeroDefinition[];
export const heroCatalog = {
  meta: heroData.meta,
  starterHeroId: heroData.starterHeroId,
  heroes,
  levelCaps: progressionData.levelCaps,
  skillUnlocks: progressionData.skillUnlocks,
  skillCaps: progressionData.skillCaps,
  expItems: progressionData.expItems as Record<string, number>,
  skillExpItems: progressionData.skillExpItems as Record<string, number>,
  levelCosts: progressionData.levelCosts as Record<string, Record<string, number>>,
  skills: progressionData.skills as { id: number; level: number; exp: number; power: number }[],
  gear: progressionData.gear as GearDefinition[],
  enhance: progressionData.enhance as { level: number; cost: Reward; attrAdd: number }[],
  formations: progressionData.formations as FormationDefinition[],
  fortify: progressionData.fortify as FortificationDefinition[],
  campaign: campaignData.campaign as StageDefinition[],
  expedition: campaignData.expedition as StageDefinition[],
  arms: campaignData.arms as BattleArmDefinition[],
  modes: campaignData.modes as {
    id: HeroBattleMode;
    label: string;
    source: string;
    npcOnly: boolean;
    stages: StageDefinition[];
  }[],
};
export const getHeroCatalog = () => heroCatalog;
export const findHero = (id: number) => heroes.find((hero) => hero.id === id);
export const bigStar = (star: number) => Math.min(5, 1 + Math.floor(star / 5));

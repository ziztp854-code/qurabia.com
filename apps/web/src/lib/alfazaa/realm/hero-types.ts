import type { Reward } from './common';
export const heroBattleModes = [
  'campaign',
  'expedition',
  'monster',
  'ruins',
  'tower',
  'mine',
  'rescue',
  'arena',
  'trial',
  'dungeon',
  'battlefield',
  'war',
] as const;
export type HeroBattleMode = (typeof heroBattleModes)[number];
export type HeroEffect = 'strike' | 'heal' | 'shield' | 'poison' | 'stun' | 'weaken' | 'buff';
export interface HeroDefinition {
  id: number;
  name: string;
  rarity: number;
  fragment: number;
  mergeCost: number;
  base: number[];
  growth: number[];
  starCost: number[];
  starAttr: number[][];
  skillTiers: number[][];
  recommended: number[];
  portrait: string;
  image: string;
  skill: {
    id: number;
    name: string;
    effect: HeroEffect;
    chance: number;
    percent: number;
    targets: number[];
    cadence: number;
  };
}
export interface OwnedSkill {
  id: number;
  level: number;
  xp: number;
}
export interface GearInstance {
  id: number;
  itemId: number;
  level: number;
}
export interface OwnedHero {
  id: number;
  level: number;
  xp: number;
  star: number;
  skills: (OwnedSkill | null)[];
  equipment: GearInstance | null;
}
export interface BattleUnit {
  id: string;
  side: 'player' | 'enemy';
  cfgId: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  cell: number | null;
}
export interface BattleEvent {
  turn: number;
  actor: string;
  target: string;
  kind: 'attack' | HeroEffect | 'defeat';
  amount: number;
  remaining: number;
  heroId?: number;
}
export interface HeroBattleReport {
  id: number;
  rulesVersion: 1;
  mode: HeroBattleMode;
  stageId: number;
  resolvedAt: number;
  won: boolean;
  firstClear: boolean;
  turns: number;
  staminaCost: number;
  reward: Reward;
  units: BattleUnit[];
  events: BattleEvent[];
  logTruncated: boolean;
  injuries: { cell: number; cfgId: number }[];
}
export interface HeroState {
  rulesVersion: 1;
  roster: Record<string, OwnedHero>;
  party: number[];
  troopCells: number[];
  formationType: number;
  formationLevels: Record<string, number>;
  fortifications: Record<string, number>;
  spareEquipment: GearInstance[];
  nextEquipmentId: number;
  stamina: number;
  staminaAt: number;
  restDay: number;
  restPurchases: number;
  battleCounter: number;
  completed: Record<HeroBattleMode, number[]>;
  lastBattle: HeroBattleReport | null;
}
export type HeroCommand =
  | { type: 'hero-recruit'; heroId: number }
  | { type: 'hero-train'; heroId: number; itemId: number; count: number }
  | { type: 'hero-star'; heroId: number }
  | { type: 'hero-skill'; heroId: number; slot: number; skillId?: number }
  | { type: 'hero-skill-forget'; heroId: number; slot: number }
  | { type: 'hero-formation'; heroIds: number[]; troopCells: number[]; formationType?: number }
  | { type: 'hero-equip'; heroId: number; itemId: number }
  | { type: 'hero-craft-gear'; itemId: number }
  | { type: 'hero-equip-upgrade'; heroId: number }
  | { type: 'hero-formation-upgrade'; formationType?: number }
  | { type: 'hero-fortify'; position: number }
  | { type: 'hero-rest' }
  | { type: 'hero-battle'; mode: HeroBattleMode; stageId: number };

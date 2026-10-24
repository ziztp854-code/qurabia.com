/** Shared public command boundary for Alfazaa's documented independent rules. */
export type Balances = Record<string, number>;
export type Reward = [number, number][];
export interface GameEvent {
  type: string;
  amount: number;
  target?: number;
  level?: number;
  cell?: number;
}
export interface HeroSnapshot {
  id: number;
  level: number;
  stars: number;
  skills: number[];
  skillLevels?: number[];
  rarity?: number;
  equipment?: { itemId: number; level: number; quality: number };
}
export interface GameplaySnapshot {
  castleLevel: number;
  playerLevel: number;
  cells: readonly ({ kind: 'troop' | 'building'; cfgId: number } | null)[];
  heroes: readonly HeroSnapshot[];
  campaignCompleted: readonly number[];
  research: Readonly<Record<string, number>>;
  lifetime: Readonly<Record<string, number>>;
  daily: Readonly<Record<string, number>>;
  world?: { allianceMember: boolean; allianceLevel: number; victories: number; gathered: number };
}
export interface GameplayContext {
  now: number;
  balances: Balances;
  view: GameplaySnapshot;
  bonuses: { attack: number; defense: number; health: number; production: number; training: number };
}
export interface GameplayResult<T> {
  ok: boolean;
  code: string;
  message: string;
  state: T;
  balances: Balances;
  events: GameEvent[];
}

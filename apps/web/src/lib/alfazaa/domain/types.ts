import type { RealmCommand, RealmState } from '../realm/types';
export type Cost = [number, number][];
export interface Arm {
  id: number;
  type: number;
  subtype: number;
  level: number;
  nextId: number | null;
  name: string;
  cost: Cost;
  image: string;
}
export interface Building {
  id: number;
  type: number;
  level: number;
  nextId: number | null;
  name: string;
  buildCost: Cost;
  upgradeCost: Cost;
  upgradeGold: number;
  requireCastle: number;
  requireBuilding: number;
  image: string;
  value: number;
  lvType: number;
  collegeLimit?: number;
  scienceLimit?: number;
  roleLevel?: number;
  attributeId?: number;
}
export interface TowerNode {
  id: string;
  camp: number;
  x: number;
  y: number;
  hp: number;
  buildingType: number;
}
export interface TowerRoute {
  from: string;
  to: string;
}
export interface TowerTroop extends TowerRoute {
  id: number;
  camp: number;
  progress: number;
  count: number;
}
export interface TowerBattle {
  levelId: number;
  startedAt: number;
  updatedAt: number;
  elapsedMs: number;
  status: 'ready' | 'active' | 'won' | 'lost';
  buildings: TowerNode[];
  routes: TowerRoute[];
  troops: TowerTroop[];
  nextTroopId: number;
}
export interface CityCell {
  id: string;
  kind: 'troop' | 'building';
  cfgId: number;
}
export interface AlfazaaState {
  version: 3;
  revision: number;
  castleLevel: number;
  balances: Record<string, number>;
  cells: (CityCell | null)[];
  nextId: number;
  lastCollectedAt: number;
  completedTowerLevels: number[];
  battle: TowerBattle | null;
  updatedAt: number;
  quests: QuestLedger;
  realm: RealmState;
}
export type QuestId = 'daily-attendance' | 'road-104' | 'road-301';
export interface QuestLedger {
  claimed: string[];
  lastDailyClaimDay: number | null;
}
export type Command =
  | RealmCommand
  | { type: 'claim-quest'; questId: QuestId }
  | { type: 'recruit'; cfgId: number }
  | { type: 'move' | 'merge'; from: number; to: number }
  | { type: 'build'; cfgId: number; cell: number }
  | { type: 'upgrade-building'; cell: number }
  | { type: 'upgrade-castle' | 'collect' | 'tower-tick' | 'tower-quit' }
  | { type: 'tower-start'; levelId: number }
  | { type: 'tower-route' | 'tower-disconnect'; from: string; to: string };
export interface CommandResult {
  ok: boolean;
  state: AlfazaaState;
  code: string;
  message: string;
}
export interface Catalog {
  arms: Arm[];
  buildings: Building[];
  items: { id: number; name: string; image: string }[];
  levels: {
    id: number;
    buildings: TowerNode[];
    barriers: { x: number; y: number; type: number }[];
  }[];
  growth: { attack: unknown; building: unknown };
  meta: {
    source: string;
    goldItemId: number;
    blueprintItemId: number;
    blueCamp: number;
    neutralCamp: number;
  };
}

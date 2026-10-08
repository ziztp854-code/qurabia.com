import type { AbandonedVillageLayout } from './abandoned-village-types';

export const resourceKeys = ['wood', 'stone', 'iron', 'food', 'gold'] as const;
export type Resource = (typeof resourceKeys)[number];
export type Resources = Record<Resource, number>;
export const buildingKeys = [
  'hall',
  'lumber',
  'quarry',
  'mine',
  'farm',
  'treasury',
  'warehouse',
  'barracks',
  'stable',
  'wall',
  'market',
  'embassy',
] as const;
export type Building = (typeof buildingKeys)[number];
export const unitKeys = ['guard', 'rider', 'scout', 'settler', 'archer', 'mounted_archer', 'sultan_guard', 'siege_engineer', 'siege_tower'] as const;
export type Unit = (typeof unitKeys)[number];
export type Troops = Record<Unit, number>;
export const commanderSpecializations = ['cavalry', 'infantry', 'archery', 'siege', 'defense', 'supply'] as const;
export type CommanderSpecialization = (typeof commanderSpecializations)[number];
export type Commander = {
  id: string; playerId: string; name: string; level: number; experience: number;
  specialization: CommanderSpecialization;
  attack: number; defense: number; mobility: number; siege: number; logistics: number;
  status: 'available' | 'assigned' | 'marching' | 'deployed';
  villageId?: string; homeVillageId?: string; cooldownUntil?: number;
};
export type CommanderView = Commander & { rankKey: string; nextLevelExperience: number | null };
export type CommanderConfig = {
  maxPerPlayer: number; maxLevel: number; recruitmentCost: Resources; maxBonus: number;
  xpBase: number; xpGrowth: number; statBase: number; statPerLevel: number;
  ranks: { minLevel: number; key: string }[];
  specializations: Record<CommanderSpecialization, { key: string }>;
  battleXp: number; victoryXp: number; casualtyXp: number; minCasualties: number;
  pairCooldownSeconds: number; xpWindowSeconds: number; xpWindowCap: number;
  recoverySeconds: number; questXp: number;
};
export type CommanderAward = { eventId: string; playerId: string; opponentId: string; at: number; xp: number };
export type Terrain = 'plains' | 'hills' | 'mountains' | 'coast' | 'desert' | 'river';
export type RegionType = 'historical_city' | 'trade_hub' | 'religious_site' | 'strategic_pass';
export type RegionConfig = {
  id: string;
  name: string;
  x: number;
  y: number;
  radius: number;
  terrain: Terrain;
  travelCostMultiplier: number;
  regionType: RegionType;
  capitalVillageId?: string;
  controlledBy?: string;
  bonus: string;
};
export type HistoricalRegion = RegionConfig;
export type SiegeStage = 'approaching' | 'besieging' | 'assaulting' | 'withdrawing';
export type Siege = {
  id: string;
  ownerId: string;
  sourceId: string;
  targetX: number;
  targetY: number;
  villageId?: string;
  troops: Troops;
  stage: SiegeStage;
  supply: number;
  startedAt: number;
  stageStartedAt: number;
  stageDeadline: number;
  nextTickAt: number;
  wallDamage: number;
  buildingDamage: Partial<Record<Building, number>>;
};
export type SiegeView = Siege & { targetName?: string };
export type SiegeConfig = {
  stages: { key: SiegeStage; durationMs: number }[];
  supplyRate: number;
  tickIntervalMs: number;
  damagePerTick: number;
  wallDamage: number;
  supplyBuildingKeys: Building[];
  maxSiegeTicks: number;
};
export type EnemySighting = {
  id: string;
  villageId: string;
  seenAt: number;
  expiresAt: number;
};
export type VisionConfig = {
  visionRadiusByBuilding: Partial<Record<Building, number>>;
  towerBuildingKey: Building;
  sharedVisionRadius: number;
  visionExpiryMs: number;
};
export type Mission =
  'attack' | 'raid' | 'scout' | 'reinforce' | 'settle' | 'occupy' | 'gather' | 'return' | 'intercept';
export type ResourceSiteKind = 'wood' | 'iron' | 'food';
export type ResourceSiteView = {
  id: string;
  x: number;
  y: number;
  resource: ResourceSiteKind;
  name: string;
  available: number;
  capacity: number;
  regenerationPerHour: number;
};
export type VillageProgressionConfig = {
  maxLevel: number;
  xpStep: number;
  buildingXp: number;
  trainingXp: number;
  achievementXp: number;
  territoryXp: number;
  buildingPower: number;
  defensePower: number;
  economicPower: number;
  strategicPower: number;
  unitPower: Record<Unit, number>;
  milestones: { level: number; buildings: Partial<Record<Building, number>> }[];
  ranks: { from: number; name: string }[];
  tiers: { from: number; tier: number }[];
};
export type VillageProgression = {
  version: 1;
  xp: number;
  level: number;
  rank: string;
  visualTier: number;
  levelStartXp: number;
  nextLevelXp: number | null;
  requirements: { building: Building; required: number; actual: number }[];
  power: {
    building: number;
    military: number;
    defense: number;
    economic: number;
    research: number;
    strategic: number;
    total: number;
  };
  /** Server-derived cache key; excluded from all command schemas. */
  signature: string;
};
export type KingdomsConfig = {
  progression?: VillageProgressionConfig;
  construction?: { maxPending: number; historyLimit: number; queuedRefund: number; activeRefund: number };
  commanders?: CommanderConfig;
  worldRadius: number;
  seasonSeconds: number;
  protectionSeconds: number;
  startingResources: Resources;
  baseProduction: Resources;
  storageBase: number;
  storagePerLevel: number;
  productionPerLevel: number;
  secondsPerTile: number;
  expansionCost: Resources;
  maxVillages: number;
  throneUnlockFraction: number;
  questReward: Resources;
  questScore: number;
  wallDefensePerLevel: number;
  barracksSpeedPerLevel: number;
  occupationTroops: number;
  settlerHallLevel: number;
  throneGoldWeight: number;
  combatLossExponent: number;
  caravans?: {
    baseSpeedTilesPerSecond: number;
    interceptWindowSeconds: number;
    maxCaravanResources: number;
    escortDefenseBonus: number;
  };
  siegeConfig?: SiegeConfig;
  vision?: VisionConfig;
  defaultRegions?: RegionConfig[];
  buildings: Record<
    Building,
    { name: string; cost: Resources; seconds: number; growth: number; maxLevel: number }
  >;
  units: Record<
    Unit,
    {
      name: string;
      cost: Resources;
      seconds: number;
      attack: number;
      defense: number;
      speed: number;
      carry: number;
      upkeep: number;
    }
  >;
};
export type AllianceEventTheme = 'build' | 'train' | 'trade';
export type AllianceEventStamp = { eventKey: string; allianceId: string };
export type AllianceEventRecord = AllianceEventStamp & {
  points: number;
  claimed: boolean;
  tradedWith: string[];
};
export type AllianceEventView = {
  eventKey: string;
  week: number;
  theme: AllianceEventTheme;
  title: string;
  description: string;
  startsAt: number;
  endsAt: number;
  target: number;
  memberCap: number;
  allianceId?: string;
  points: number;
  ownPoints: number;
  claimed: boolean;
  lockedToOtherAlliance: boolean;
  canClaim: boolean;
  reward: Resources;
  contributors: { id: string; name: string; points: number }[];
};
export type ConstructionItem = {
  allianceEvent?: AllianceEventStamp;
  id: string;
  villageId: string;
  building: Building;
  fromLevel: number;
  targetLevel: number;
  queuedAt: number;
  startedAt: number;
  endsAt: number;
  cost: Resources;
  status: 'BUILDING' | 'QUEUED' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
  legacy?: boolean;
  refundedCost?: Resources;
};
export type Village = {
  progression?: VillageProgression;
  constructionQueue?: ConstructionItem[];
  commanderId?: string;
  reinforcementCommanders?: Record<string, string>;
  id: string;
  ownerId: string;
  name: string;
  x: number;
  y: number;
  resources: Resources;
  updatedAt: number;
  buildings: Record<Building, number>;
  troops: Troops;
  reinforcements: Record<string, Troops>;
  build?: {
    building: Building;
    level: number;
    startedAt?: number;
    endsAt: number;
    allianceEvent?: AllianceEventStamp;
  };
  training?: { unit: Unit; count: number; endsAt: number; allianceEvent?: AllianceEventStamp };
};
export type KingdomPlayer = {
  id: string;
  name: string;
  joinedAt: number;
  protectionUntil: number;
  allianceId?: string;
  allianceEvent?: AllianceEventRecord;
  claims: string[];
  achievements: string[];
  score: number;
  throne: number;
};
export type Movement = {
  abandonedGather?: { targetId: string; worldId: string };
  commanderId?: string;
  gather?: { siteId: string; resource: ResourceSiteKind };
  id: string;
  ownerId: string;
  sourceId: string;
  targetX: number;
  targetY: number;
  mission: Mission;
  troops: Troops;
  departedAt: number;
  arrivesAt: number;
  travelMs: number;
  loot: Resources;
};
/** Hostile or allied inbound missions a target owner may see. */
export const incomingMissions = ['attack', 'raid', 'scout', 'reinforce', 'intercept'] as const;
export type IncomingMission = (typeof incomingMissions)[number];
export const isIncomingMission = (mission: string): mission is IncomingMission =>
  incomingMissions.includes(mission as IncomingMission);
/** Public map identity already exposed on KingdomsView.map. */
export type IncomingSourceView = {
  id: string;
  name: string;
  x: number;
  y: number;
  kingdomName: string;
  ownerId: string;
  allianceId?: string;
  protectedUntil: number;
};
/** Redacted inbound row. Never includes troops, commander, loot, or travel. */
export type IncomingMovementView = {
  id: string;
  mission: IncomingMission;
  targetVillageId: string;
  arrivesAt: number;
  source?: IncomingSourceView;
};
export type KingdomReport = {
  id: string;
  at: number;
  recipients: string[];
  title: string;
  detail: string;
  combat?: {
    attack: number;
    defense: number;
    attackerBefore: Troops;
    attackerAfter: Troops;
    defenderBefore: Troops;
    defenderAfter: Troops;
    loot: Resources;
  };
  intel?: { resources: Resources; troops: Troops; buildings: Record<Building, number> };
};
export type Alliance = {
  pending?: string[];
  id: string;
  name: string;
  members: Record<string, 'leader' | 'officer' | 'member'>;
  diplomacy: Record<string, 'war' | 'peace' | 'ally'>;
};
export type Offer = {
  id: string;
  ownerId: string;
  villageId: string;
  give: Resources;
  want: Resources;
  createdAt: number;
};
export type CaravanStatus = 'preparing' | 'traveling' | 'arrived' | 'intercepted' | 'returned';
export type Caravan = {
  id: string;
  ownerId: string;
  originVillageId: string;
  targetVillageId: string;
  resources: Resources;
  departsAt: number;
  arrivesAt: number;
  status: CaravanStatus;
  route: { x: number; y: number }[];
  exposed: boolean;
};
export type CaravanIntercept = {
  carrierId: string;
  interceptorVillageId: string;
  interceptorPlayerId: string;
  troops: Troops;
  dispatchedAt: number;
};
export type CaravanView = Pick<Caravan, 'id' | 'ownerId' | 'originVillageId' | 'targetVillageId' | 'resources' | 'departsAt' | 'arrivesAt' | 'status' | 'route'>;
export type KingdomsWorld = {
  /** Optional, explicitly provisioned world registry; reads never generate or reset it. */
  abandonedVillages?: AbandonedVillageLayout;
  commanders?: Record<string, Commander>;
  commanderAwards?: CommanderAward[];
  resourceSiteStocks?: Record<string, { available: number; updatedAt: number }>;
  version: 1;
  nextId: number;
  updatedAt: number;
  config: KingdomsConfig;
  players: Record<string, KingdomPlayer>;
  villages: Record<string, Village>;
  movements: Movement[];
  reports: KingdomReport[];
  alliances: Record<string, Alliance>;
  offers: Offer[];
  territories: Record<string, string>;
  caravans: Caravan[];
  sieges: Record<string, Siege>;
  enemySightings: EnemySighting[];
  season: {
    number: number;
    startsAt: number;
    endsAt: number;
    status: 'active' | 'ended';
    winnerId?: string;
    winnerAllianceId?: string;
  };
};
export type KingdomsView = {
  abandonedVillages?: import('./abandoned-village-types').AbandonedVillageView[];
  commanders?: CommanderView[];
  resourceSites?: ResourceSiteView[];
  allianceEvent?: AllianceEventView | null;
  serverNow: number;
  config: KingdomsConfig;
  season: KingdomsWorld['season'];
  player: KingdomPlayer | null;
  villages: Village[];
  productionRates: Record<string, Resources>;
  /** Gross hourly yield and food upkeep behind productionRates. Optional for older fixtures. */
  productionBreakdown?: Record<string, { gross: Resources; upkeep: number; net: Resources }>;
  map: {
    id: string;
    ownerId: string;
    name: string;
    x: number;
    y: number;
    kingdomName: string;
    allianceId?: string;
    protectedUntil: number;
  }[];
  movements: Movement[];
  incoming: IncomingMovementView[];
  caravans: CaravanView[];
  sieges: SiegeView[];
  enemySightings: EnemySighting[];
  reports: KingdomReport[];
  alliances: Alliance[];
  offers: Offer[];
  territories: Record<string, string>;
  leaderboard: {
    id: string;
    name: string;
    score: number;
    throne: number;
    villages: number;
    allianceId?: string;
  }[];
};

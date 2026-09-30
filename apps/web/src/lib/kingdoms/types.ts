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
  'wall',
  'market',
  'embassy',
] as const;
export type Building = (typeof buildingKeys)[number];
export const unitKeys = ['guard', 'rider', 'scout', 'settler'] as const;
export type Unit = (typeof unitKeys)[number];
export type Troops = Record<Unit, number>;
export type Mission = 'attack' | 'raid' | 'scout' | 'reinforce' | 'settle' | 'occupy' | 'return';
export type KingdomsConfig = {
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
export type Village = {
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
export type KingdomsWorld = {
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
  allianceEvent?: AllianceEventView | null;
  serverNow: number;
  config: KingdomsConfig;
  season: KingdomsWorld['season'];
  player: KingdomPlayer | null;
  villages: Village[];
  productionRates: Record<string, Resources>;
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

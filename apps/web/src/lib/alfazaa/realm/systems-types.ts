import type { GameplayContext } from './common';
export type QuestFamily = 'main' | 'road' | 'plot' | 'daily' | 'milestone';
export type ResearchTree = 'college' | 'science';
export interface SystemsJob {
  id: number;
  kind: 'research' | 'training' | 'healing' | 'hatch';
  startedAt: number;
  finishAt: number;
  target: number;
  count: number;
  tree?: ResearchTree;
}
export interface SystemsState {
  rulesVersion: 1;
  lastAt: number;
  day: number;
  week: number;
  weekly: Record<string, number>;
  lifetime: Record<string, number>;
  daily: Record<string, number>;
  research: Record<string, number>;
  jobs: SystemsJob[];
  nextJobId: number;
  reserve: Record<string, number>;
  wounded: Record<string, number>;
  claims: string[];
  dailyClaims: number[];
  dailyChoices: number[];
  boxes: number[];
  shopLifetime: Record<string, number>;
  shopDaily: Record<string, number>;
  beasts: Record<string, number>;
  destroyerLevel: number;
  relics: Record<string, number>;
  equippedRelics: number[];
  eventClaims: string[];
}
export type SystemsCommand =
  | { type: 'systems-research'; tree: ResearchTree; id: number }
  | { type: 'systems-train' | 'systems-heal'; cfgId: number; count: number }
  | { type: 'systems-deploy'; cfgId: number }
  | { type: 'systems-use'; itemId: number; count: number; choice?: number }
  | { type: 'systems-craft'; recipeId: number; count: number }
  | { type: 'systems-buy'; offerId: number; count: number }
  | { type: 'systems-exchange'; itemId: number; count: number }
  | { type: 'systems-speedup'; jobId: number; itemId: number; count: number }
  | { type: 'systems-claim'; family: QuestFamily; id: number }
  | { type: 'systems-daily-box'; index: number }
  | { type: 'systems-beast-hatch' | 'systems-beast-feed'; beastId: number }
  | { type: 'systems-destroyer-upgrade' }
  | {
      type: 'systems-relic-upgrade' | 'systems-relic-equip' | 'systems-relic-dismantle';
      relicId: number;
    }
  | { type: 'systems-event-claim'; eventId: 'daily-campaign' | 'weekly-commander'; tier: number }
  | { type: 'systems-tick' };
export interface QuestView {
  id: number;
  family: QuestFamily;
  name: string;
  description: string;
  sourceDescription: string;
  sourceGoal: number;
  progress: number;
  goal: number;
  status: 'locked' | 'active' | 'ready' | 'claimed' | 'unavailable';
  reward: [number, number][];
  binding: string;
  adaptation: string | null;
  chapter: number;
}
export type SystemsContext = GameplayContext;

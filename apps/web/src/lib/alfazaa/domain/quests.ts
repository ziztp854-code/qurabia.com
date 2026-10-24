import raw from '../data/quests.json';
import { getBuilding } from './catalog';
import type { AlfazaaState, Cost, QuestId } from './types';

interface QuestDefinition {
  id: QuestId;
  title: string;
  description: string;
  rewards: Cost;
  requirement:
    | { kind: 'daily' }
    | { kind: 'castle-level'; level: number }
    | { kind: 'building-level'; buildingType: number; level: number; castleLevel: number };
}
export const questDefinitions = raw.quests as unknown as QuestDefinition[];
export function riyadhDay(now: number): number {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('INVALID_TIME');
  return Math.floor((now + 10_800_000) / 86_400_000);
}
function meetsRequirement(state: AlfazaaState, quest: QuestDefinition): boolean {
  const requirement = quest.requirement;
  if (requirement.kind === 'daily') return true;
  if (requirement.kind === 'castle-level') return state.castleLevel >= requirement.level;
  return (
    state.castleLevel >= requirement.castleLevel &&
    state.cells.some((cell) => {
      const row = cell?.kind === 'building' ? getBuilding(cell.cfgId) : undefined;
      return row?.type === requirement.buildingType && row.level >= requirement.level;
    })
  );
}
export function listQuests(state: AlfazaaState, now: number) {
  const day = riyadhDay(now);
  return questDefinitions.map((quest) => {
    const claimed =
      quest.id === 'daily-attendance'
        ? state.quests.lastDailyClaimDay === day
        : state.quests.claimed.includes(quest.id) || state.realm.systems.claims.includes(quest.id.replace('road-', 'road:'));
    return {
      id: quest.id,
      title: quest.title,
      description: quest.description,
      rewards: quest.rewards,
      claimed,
      ready: !claimed && meetsRequirement(state, quest),
    };
  });
}
export function claimQuest(state: AlfazaaState, questId: QuestId, now: number): AlfazaaState {
  if (now < state.updatedAt) throw new Error('INVALID_TIME');
  const day = riyadhDay(now),
    quest = questDefinitions.find((row) => row.id === questId);
  if (!quest) throw new Error('UNKNOWN_QUEST');
  if (state.quests.lastDailyClaimDay !== null && state.quests.lastDailyClaimDay > day)
    throw new Error('INVALID_TIME');
  const claimed =
    questId === 'daily-attendance'
      ? state.quests.lastDailyClaimDay === day
      : state.quests.claimed.includes(questId) || state.realm.systems.claims.includes(questId.replace('road-', 'road:'));
  if (claimed) throw new Error('QUEST_ALREADY_CLAIMED');
  if (!meetsRequirement(state, quest)) throw new Error('QUEST_REQUIREMENT');
  const balances = quest.rewards.reduce((result, [id, amount]) => {
    const value = (result[id] ?? 0) + amount;
    if (!Number.isSafeInteger(value) || value < 0 || value > 1e12)
      throw new Error('RESOURCE_LIMIT');
    return { ...result, [id]: value };
  }, state.balances);
  return {
    ...state,
    balances,
    realm: questId === 'daily-attendance' ? state.realm : { ...state.realm, systems: {
      ...state.realm.systems, claims: [...new Set([...state.realm.systems.claims, questId.replace('road-', 'road:')])],
    } },
    quests:
      questId === 'daily-attendance'
        ? { ...state.quests, lastDailyClaimDay: day }
        : { ...state.quests, claimed: [...state.quests.claimed, questId] },
  };
}

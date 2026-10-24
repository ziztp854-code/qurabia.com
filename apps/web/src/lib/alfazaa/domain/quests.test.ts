import { describe, expect, it } from 'vitest';
import { applyCommand, createInitialState, validateState, listQuests, type QuestId } from './index';

describe('Alfazaa authoritative quests', () => {
  it('upgrades an unchanged v1 save with an empty reward ledger', () => {
    const initial = createInitialState(1000);
    const legacy = { ...initial, version: 1 } as Record<string, unknown>;
    delete legacy.quests;
    const snapshot = structuredClone(legacy);
    const restored = validateState(legacy);
    expect(restored).toMatchObject({
      version: 2,
      revision: 0,
      quests: { claimed: [], lastDailyClaimDay: null },
    });
    expect(restored?.balances).toEqual(initial.balances);
    expect(legacy).toEqual(snapshot);
  });
  it('claims the complete sourced attendance reward exactly once on a server day', () => {
    const state = createInitialState(0),
      snapshot = structuredClone(state);
    const first = applyCommand(state, { type: 'claim-quest', questId: 'daily-attendance' }, 0);
    expect(first.ok).toBe(true);
    expect(first.state.balances).toMatchObject({
      '110001': 220,
      '400091': 5,
      '420001': 5,
      '200127': 50,
    });
    const duplicate = applyCommand(
      first.state,
      { type: 'claim-quest', questId: 'daily-attendance' },
      1000,
    );
    expect(duplicate.ok).toBe(false);
    expect(duplicate.code).toBe('QUEST_ALREADY_CLAIMED');
    expect(duplicate.state).toBe(first.state);
    expect(state).toEqual(snapshot);
  });
  it('bootstraps a housing-less old save once without resetting existing progress', () => {
    const initial = createInitialState(1000);
    const legacy = {
      ...initial,
      version: 1,
      castleLevel: 6,
      balances: { ...initial.balances, '400001': 0 },
      cells: initial.cells.map((cell, index) => (index === 35 ? null : cell)),
    } as Record<string, unknown>;
    delete legacy.quests;
    const restored = validateState(legacy)!;
    expect(restored.castleLevel).toBe(6);
    expect(restored.balances['400001']).toBe(0);
    expect(
      restored.cells.filter((cell) => cell?.kind === 'building' && cell.cfgId === 40001),
    ).toHaveLength(1);
    expect(restored.nextId).toBe(5);
    expect(validateState(restored)).toEqual(restored);
  });
  it('resets attendance at Riyadh midnight, never on clock rollback', () => {
    const before = Date.UTC(2026, 9, 24, 20, 59, 59, 999),
      initial = createInitialState(before);
    const first = applyCommand(
      initial,
      { type: 'claim-quest', questId: 'daily-attendance' },
      before,
    ).state;
    expect(
      applyCommand(first, { type: 'claim-quest', questId: 'daily-attendance' }, before).code,
    ).toBe('QUEST_ALREADY_CLAIMED');
    const second = applyCommand(
      first,
      { type: 'claim-quest', questId: 'daily-attendance' },
      before + 1,
    );
    expect(second.ok).toBe(true);
    expect(second.state.balances['110001']).toBe(240);
    expect(
      applyCommand(second.state, { type: 'claim-quest', questId: 'daily-attendance' }, before).code,
    ).toBe('INVALID_TIME');
  });
  it('checks original castle quest conditions and pays its full tuple only once', () => {
    let state = createInitialState(0);
    expect(applyCommand(state, { type: 'claim-quest', questId: 'road-104' }, 0).code).toBe(
      'QUEST_REQUIREMENT',
    );
    state = applyCommand(state, { type: 'upgrade-castle' }, 0).state;
    state = applyCommand(state, { type: 'upgrade-castle' }, 0).state;
    const claim = applyCommand(state, { type: 'claim-quest', questId: 'road-104' }, 0);
    expect(claim.ok).toBe(true);
    expect(claim.state.balances).toMatchObject({ '110001': 250, '110023': 25, '800081': 10 });
    expect(claim.state.quests.claimed).toEqual(['road-104']);
    expect(applyCommand(claim.state, { type: 'claim-quest', questId: 'road-104' }, 1).code).toBe(
      'QUEST_ALREADY_CLAIMED',
    );
  });
  it('requires the actual infantry building and minimum level for the road quest', () => {
    const initial = createInitialState(0),
      castle = { ...initial, castleLevel: 7 };
    const withBuilding = (cfgId: number) => ({
      ...castle,
      cells: castle.cells.map((cell, index) =>
        index === 2 ? { id: 'test-build', kind: 'building' as const, cfgId } : cell,
      ),
    });
    expect(
      applyCommand(withBuilding(20007), { type: 'claim-quest', questId: 'road-301' }, 0).code,
    ).toBe('QUEST_REQUIREMENT');
    expect(
      applyCommand(withBuilding(10006), { type: 'claim-quest', questId: 'road-301' }, 0).code,
    ).toBe('QUEST_REQUIREMENT');
    const claim = applyCommand(
      withBuilding(10007),
      { type: 'claim-quest', questId: 'road-301' },
      0,
    );
    expect(claim.ok).toBe(true);
    expect(claim.state.balances).toMatchObject({ '110001': 250, '100001': 10, '800081': 50 });
  });
  it('bounds every reward atomically and rejects corrupted claim ledgers', () => {
    const initial = createInitialState(0),
      full = { ...initial, balances: { ...initial.balances, '110001': 1e12 } };
    const rejected = applyCommand(full, { type: 'claim-quest', questId: 'daily-attendance' }, 0);
    expect(rejected.code).toBe('RESOURCE_LIMIT');
    expect(rejected.state).toBe(full);
    expect(rejected.state.balances['400091']).toBeUndefined();
    expect(
      validateState({
        ...initial,
        quests: { claimed: ['road-104', 'road-104'], lastDailyClaimDay: null },
      }),
    ).toBeNull();
    expect(
      validateState({ ...initial, quests: { claimed: ['fake'], lastDailyClaimDay: null } }),
    ).toBeNull();
    expect(validateState({ ...initial, quests: { claimed: [], lastDailyClaimDay: 1 } })).toBeNull();
    expect(validateState({ ...initial, quests: undefined })).toBeNull();
  });
  it('gives a full housing-less v1 city only one minimum-build-cost compatibility credit', () => {
    const initial = createInitialState(0);
    const legacy = {
      ...initial,
      version: 1,
      balances: { ...initial.balances, '400001': 0 },
      cells: initial.cells.map((_, index) => ({
        id: String(index + 1),
        kind: 'troop',
        cfgId: 10001,
      })),
      nextId: 37,
    } as Record<string, unknown>;
    delete legacy.quests;
    const migrated = validateState(legacy)!;
    expect(migrated.balances['400001']).toBe(480);
    expect(migrated.cells.filter(Boolean)).toHaveLength(36);
    const spent = { ...migrated, balances: { ...migrated.balances, '400001': 0 } };
    expect(validateState(spent)?.balances['400001']).toBe(0);
  });
  it('projects claim readiness without granting rewards and rejects unknown task identities', () => {
    const initial = createInitialState(0),
      snapshot = structuredClone(initial);
    expect(
      listQuests(initial, 0).map(({ id, ready, claimed }) => ({ id, ready, claimed })),
    ).toEqual([
      { id: 'daily-attendance', ready: true, claimed: false },
      { id: 'road-104', ready: false, claimed: false },
      { id: 'road-301', ready: false, claimed: false },
    ]);
    const claimed = applyCommand(
      initial,
      { type: 'claim-quest', questId: 'daily-attendance' },
      0,
    ).state;
    expect(listQuests(claimed, 0)[0]).toMatchObject({ ready: false, claimed: true });
    expect(listQuests(claimed, 86_400_000)[0]).toMatchObject({ ready: true, claimed: false });
    expect(
      applyCommand(initial, { type: 'claim-quest', questId: 'unknown' as QuestId }, 0).code,
    ).toBe('UNKNOWN_QUEST');
    expect(validateState({ ...initial, version: 1 })).toBeNull();
    expect(initial).toEqual(snapshot);
  });
});

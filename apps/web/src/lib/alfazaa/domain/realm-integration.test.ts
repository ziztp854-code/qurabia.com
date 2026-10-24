import { describe, expect, it } from 'vitest';
import { applyCommand, createInitialState, validateState } from './index';

const now = 1792800000000;
describe('playable account command cycle', () => {
  it('shares road reward receipts across the legacy and full quest interfaces in both directions', () => {
    const initial = { ...createInitialState(now), castleLevel: 3 };
    const legacy = applyCommand(initial, { type: 'claim-quest', questId: 'road-104' }, now);
    expect(legacy.ok).toBe(true);
    const duplicateNew = applyCommand(legacy.state, { type: 'systems-claim', family: 'road', id: 104 }, now);
    expect(duplicateNew.ok).toBe(false);
    expect(duplicateNew.state.balances).toEqual(legacy.state.balances);
    const modern = applyCommand(initial, { type: 'systems-claim', family: 'road', id: 104 }, now);
    expect(modern.ok).toBe(true);
    const duplicateOld = applyCommand(modern.state, { type: 'claim-quest', questId: 'road-104' }, now);
    expect(duplicateOld.ok).toBe(false);
    expect(duplicateOld.state.balances).toEqual(modern.state.balances);
  });
  it('uses city troops in a hero battle, receives the first-clear award once and restores the save', () => {
    const initial = createInitialState(now);
    const formation = applyCommand(initial, { type: 'hero-formation', heroIds: [62003], troopCells: [0, 1] }, now);
    expect(formation.ok).toBe(true);
    const battle = applyCommand(formation.state, { type: 'hero-battle', mode: 'campaign', stageId: 1 }, now);
    expect(battle.ok).toBe(true);
    expect(battle.state.realm.heroes.lastBattle).toMatchObject({ won: true, firstClear: true });
    expect(battle.state.balances['1200001']).toBe(20);
    expect(battle.state.realm.systems.lifetime['campaign-win']).toBe(1);
    const replay = applyCommand(battle.state, { type: 'hero-battle', mode: 'campaign', stageId: 1 }, now);
    expect(replay.ok).toBe(true);
    expect(replay.state.balances['1200001']).toBe(20);
    expect(validateState(JSON.parse(JSON.stringify(replay.state)))).toEqual(replay.state);
  });
});

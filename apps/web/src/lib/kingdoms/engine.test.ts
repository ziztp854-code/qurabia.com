import { describe, expect, it } from 'vitest';
import { advanceWorld, createWorld, executeCommand, nextEventAt, projectWorld } from './engine';
import { defaultKingdomsConfig, resources } from './config';
const start = 1_800_000_000_000;
const found = () =>
  executeCommand(createWorld(start), 'alice', { type: 'found', name: 'مملكة النور' }, start);
describe('Kingdoms authoritative simulation', () => {
  it('selects the earliest queued deadline and handles idle worlds', () => {
    const w = found(),
      id = Object.keys(w.villages)[0];
    expect(nextEventAt(w)).toBe(w.season.endsAt);
    w.villages[id].build = { building: 'farm', level: 1, endsAt: start + 60000 };
    w.villages[id].training = { unit: 'guard', count: 1, endsAt: start + 30000 };
    expect(nextEventAt(w)).toBe(start + 30000);
    const afterTraining = advanceWorld(w, start + 30000);
    expect(nextEventAt(afterTraining)).toBe(start + 60000);
    expect(nextEventAt(advanceWorld(afterTraining, w.season.endsAt))).toBeNull();
  });
  it('counts every player village in leaderboard independently from visible villages', () => {
    const w = executeCommand(found(), 'bob', { type: 'found', name: 'مملكة الظل' }, start);
    const original = Object.values(w.villages).find((v) => v.ownerId === 'bob')!;
    w.villages.extra = { ...structuredClone(original), id: 'extra', x: 20, y: 20 };
    const view = projectWorld(w, 'alice', start);
    expect(view.villages).toHaveLength(1);
    expect(view.leaderboard.find((p) => p.id === 'alice')?.villages).toBe(1);
    expect(view.leaderboard.find((p) => p.id === 'bob')?.villages).toBe(2);
  });
  it('accrues offline resources without changing input or double credit', () => {
    const w = found(),
      id = Object.keys(w.villages)[0];
    const a = advanceWorld(w, start + 3600000);
    expect(a.villages[id].resources.wood).toBe(980);
    expect(w.villages[id].resources.wood).toBe(900);
    expect(advanceWorld(a, start + 3600000)).toEqual(a);
  });
  it('reserves construction costs once and uses completion timestamps', () => {
    const w = found(),
      id = Object.keys(w.villages)[0];
    const a = executeCommand(
      w,
      'alice',
      { type: 'build', villageId: id, building: 'lumber' },
      start,
    );
    expect(a.villages[id].resources.wood).toBe(820);
    expect(() =>
      executeCommand(a, 'alice', { type: 'build', villageId: id, building: 'farm' }, start),
    ).toThrow();
    expect(advanceWorld(a, start + 60000).villages[id].buildings.lumber).toBe(1);
    expect(advanceWorld(a, start + 3660000).villages[id].resources.wood).toBeCloseTo(
      820 + 80 / 60 + 108,
    );
  });
  it('rejects unowned villages and insufficient funds', () => {
    const w = found(),
      id = Object.keys(w.villages)[0];
    expect(() =>
      executeCommand(w, 'bob', { type: 'build', villageId: id, building: 'hall' }, start),
    ).toThrow();
    expect(() =>
      executeCommand(
        w,
        'alice',
        { type: 'train', villageId: id, unit: 'guard', count: 10000 },
        start,
      ),
    ).toThrow();
  });
  it('trains only at completion and deducts costs upfront', () => {
    const w = found(),
      id = Object.keys(w.villages)[0];
    w.villages[id].buildings.barracks = 1;
    const a = executeCommand(
      w,
      'alice',
      { type: 'train', villageId: id, unit: 'guard', count: 2 },
      start,
    );
    expect(a.villages[id].troops.guard).toBe(0);
    expect(a.villages[id].resources.iron).toBe(810);
    expect(advanceWorld(a, start + 60000).villages[id].troops.guard).toBe(2);
  });
  it('validates bounded integer command input', () => {
    expect(() =>
      executeCommand(
        found(),
        'alice',
        { type: 'train', villageId: 'v1', unit: 'guard', count: -1 },
        start,
      ),
    ).toThrow();
    expect(() => createWorld(start, { ...defaultKingdomsConfig, secondsPerTile: -1 })).toThrow();
  });
  it('keeps enemy resources and orders private', () => {
    const w = executeCommand(found(), 'bob', { type: 'found', name: 'مملكة الظل' }, start);
    const view = projectWorld(w, 'alice', start);
    expect(view.villages).toHaveLength(1);
    expect(view.map).toHaveLength(2);
    expect(view.map[1]).not.toHaveProperty('resources');
  });
  it('claims rewards exactly once', () => {
    const w = found(),
      id = Object.keys(w.villages)[0];
    w.villages[id].buildings.lumber = 1;
    const a = executeCommand(w, 'alice', { type: 'claim', mission: 'builder' }, start);
    expect(a.players.alice.claims).toContain('builder');
    expect(() =>
      executeCommand(a, 'alice', { type: 'claim', mission: 'builder' }, start),
    ).toThrow();
    expect(a.villages[id].resources.gold).toBe(175);
  });
  it('settles season at deadline and rejects late spending', () => {
    const w = found();
    w.players.alice.throne = 200;
    const a = advanceWorld(w, w.season.endsAt);
    expect(a.season.winnerId).toBe('alice');
    expect(() =>
      executeCommand(
        a,
        'alice',
        { type: 'throne', villageId: Object.keys(w.villages)[0], resources: resources(10) },
        a.updatedAt,
      ),
    ).toThrow();
  });
});

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { advanceWorld, createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import { resourceKeys } from '@/lib/kingdoms/types';
import { number, type WorldView } from './shared';
import { resourceStockDeadline, useResourceStock } from './use-resource-stock';

const start = 1_800_000_000_000;
function fixture() {
  const world = executeCommand(createWorld(start), 'p', { type: 'found', name: 'قرية' }, start);
  world.config.baseProduction = { wood: 3600, stone: 1800, iron: 900, food: 3600, gold: 45 };
  const village = Object.values(world.villages)[0];
  village.resources = { wood: 1000, stone: 1000, iron: 1000, food: 1000, gold: 1000 };
  const view: WorldView = {
    ...projectWorld(world, 'p', start),
    worldId: 'w',
    worldName: 'عالم',
    revision: 0,
    paused: false,
  };
  return { world, view };
}
function clock() {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('live resource stock', () => {
  it('advances every second with the same fractional balance as the server without mutating its snapshot', () => {
    clock();
    const { world, view } = fixture();
    const snapshot = structuredClone(view);
    const { result } = renderHook(() => useResourceStock(view, view.villages[0]));
    for (let second = 1; second <= 10; second++) {
      act(() => vi.advanceTimersByTime(1000));
      const authoritative = Object.values(advanceWorld(world, start + second * 1000).villages)[0];
      expect(result.current).toEqual(authoritative.resources);
    }
    expect(number(result.current.wood)).toBe('١٬٠١٠');
    expect(view).toEqual(snapshot);
  });

  it('stops at storage capacity and bounds stale extrapolation to the polling window', () => {
    clock();
    const { view } = fixture();
    view.villages[0].resources.wood = 1999.5;
    const { result, unmount } = renderHook(() => useResourceStock(view, view.villages[0]));
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.wood).toBe(2000);
    expect(result.current.food).toBe(1015);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rebases immediately on a server response after spending and when changing villages', () => {
    clock();
    const { view } = fixture();
    const { result, rerender } = renderHook(
      ({ current }) => useResourceStock(current, current.villages[0]),
      { initialProps: { current: view } },
    );
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.wood).toBe(1005);
    const next = structuredClone(view);
    next.serverNow += 5000;
    next.revision++;
    next.villages[0].resources.wood = 400;
    rerender({ current: next });
    expect(result.current.wood).toBe(400);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.wood).toBe(401);
    const changed = structuredClone(next);
    const village = changed.villages[0];
    village.id = 'other-village';
    village.resources.wood = 700;
    changed.productionRates[village.id] = changed.productionRates[view.villages[0].id];
    rerender({ current: changed });
    expect(result.current.wood).toBe(700);
  });

  it('freezes at construction, training, movement and season deadlines', () => {
    const { view } = fixture();
    const built = structuredClone(view);
    built.villages[0].build = { building: 'farm', level: 1, endsAt: start + 2000 };
    expect(resourceStockDeadline(built)).toBe(start + 2000);
    const trained = structuredClone(view);
    trained.villages[0].training = { unit: 'guard', count: 1, endsAt: start + 3000 };
    expect(resourceStockDeadline(trained)).toBe(start + 3000);
    const threatened = structuredClone(view);
    threatened.incoming = [
      {
        id: 'attack',
        mission: 'attack',
        targetVillageId: view.villages[0].id,
        arrivesAt: start + 4000,
      },
    ];
    expect(resourceStockDeadline(threatened)).toBe(start + 4000);
    view.season.endsAt = start + 5000;
    expect(resourceStockDeadline(view)).toBe(start + 5000);
    clock();
    const { result } = renderHook(() => useResourceStock(built, built.villages[0]));
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current.food).toBe(1002);
  });

  it.each(['paused', 'ended', 'zero'] as const)('keeps stock fixed when %s', (mode) => {
    clock();
    const { view } = fixture();
    if (mode === 'paused') view.paused = true;
    if (mode === 'ended') view.season.status = 'ended';
    if (mode === 'zero') {
      for (const key of resourceKeys) view.productionRates[view.villages[0].id][key] = 0;
    }
    const { result } = renderHook(() => useResourceStock(view, view.villages[0]));
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current).toEqual(view.villages[0].resources);
  });
});

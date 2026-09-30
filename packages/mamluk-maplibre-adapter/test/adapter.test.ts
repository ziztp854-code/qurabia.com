import { describe, expect, it, vi } from 'vitest';
import type { MapPayload } from '@mamluk/world-map-core';
import { MapLibreAdapter } from '../src/adapter';
import { FakeMap, payload } from './fixtures';

describe('MapLibre presentation boundary', () => {
  it('replaces every source snapshot so disappeared enemies leave no remnants', () => {
    const map = new FakeMap();
    const adapter = new MapLibreAdapter(map.port(), { now: () => 1000 });
    adapter.resetSession('world');
    adapter.render(payload('1', true));
    expect(map.data('armies').features).toHaveLength(1);
    const previousSource = map.getSource('mamluk-armies');
    adapter.render(payload('2'));
    expect(map.data('armies').features).toEqual([]);
    expect(map.getSource('mamluk-armies')).not.toBe(previousSource);
    expect(map.layers.size).toBe(9);
    adapter.dispose();
  });

  it('expires snapshots conservatively including their delivery time', () => {
    const map = new FakeMap();
    const jobs: { task: () => void; delay: number }[] = [];
    const onExpire = vi.fn();
    const adapter = new MapLibreAdapter(map.port(), {
      now: () => 50,
      schedule: (task, delay) => {
        jobs.push({ task, delay });
        return () => {};
      },
      onExpire,
    });
    adapter.resetSession('world');
    adapter.render(payload('1', true), 2000);
    expect(jobs[0]!.delay).toBe(8000);
    jobs[0]!.task();
    expect(map.data('armies').features).toEqual([]);
    expect(onExpire).toHaveBeenCalledOnce();
    adapter.dispose();
  });

  it('cannot extend authorization lifetime by replaying the same snapshot', () => {
    const map = new FakeMap();
    let now = 0;
    const delays: number[] = [];
    const adapter = new MapLibreAdapter(map.port(), {
      now: () => now,
      schedule: (_task, delay) => {
        delays.push(delay);
        return () => {};
      },
    });
    adapter.resetSession('world');
    adapter.render(payload('1', true));
    now = 9000;
    adapter.render(payload('1', true));
    expect(delays).toEqual([10000, 1000]);
    now = 11000;
    expect(() => adapter.render(payload('1', true))).toThrow('expired');
    expect(map.data('armies').features).toEqual([]);
    adapter.dispose();
  });

  it('restores all presentation sources and globe projection after changing basemap', () => {
    const map = new FakeMap();
    const adapter = new MapLibreAdapter(map.port(), { now: () => 1000 });
    adapter.resetSession('world');
    adapter.render(payload('1', true));
    adapter.setProjection('globe');
    adapter.setBasemap('https://example.com/style.json');
    map.ready = true;
    map.projection = 'mercator';
    map.fire('style.load');
    expect(map.projection).toBe('globe');
    expect(map.layers.size).toBe(9);
    expect(map.data('armies').features).toHaveLength(1);
    adapter.dispose();
  });

  it('normalizes unwrapped dateline bounds and full world view', () => {
    const map = new FakeMap();
    const adapter = new MapLibreAdapter(map.port());
    expect(adapter.getViewportBounds()).toEqual({ west: 170, east: -170, south: -10, north: 10 });
    map.bounds = { west: -230, east: 230, south: -100, north: 100 };
    expect(adapter.getViewportBounds()).toEqual({ west: -180, east: 180, south: -90, north: 90 });
    expect(adapter.project({ longitude: 31, latitude: 30 })).toEqual({ x: 31, y: 30 });
    expect(adapter.unproject({ x: 190, y: 30 })).toEqual({ longitude: -170, latitude: 30 });
    adapter.dispose();
  });

  it('rejects stale revisions and wrong-world payloads and resets revisions with the session', () => {
    const map = new FakeMap();
    const adapter = new MapLibreAdapter(map.port());
    adapter.resetSession('world');
    adapter.render(payload('2'));
    adapter.render(payload('1', true));
    expect(map.data('armies').features).toEqual([]);
    expect(() => adapter.render({ ...payload('3'), worldId: 'other' })).toThrow('active world');
    adapter.resetSession('other');
    adapter.render({ ...payload('1', true), worldId: 'other' });
    expect(map.data('armies').features).toHaveLength(1);
    adapter.dispose();
  });

  it('accepts another viewport at the same world revision but rejects an older server snapshot', () => {
    const map = new FakeMap();
    const adapter = new MapLibreAdapter(map.port());
    adapter.resetSession('world');
    adapter.render(payload('2'));
    adapter.render({ ...payload('2', true), bounds: { west: 40, east: 50, south: 20, north: 30 } });
    expect(map.data('armies').features).toHaveLength(1);
    adapter.render({ ...payload('2'), serverTime: 999 });
    expect(map.data('armies').features).toHaveLength(1);
    adapter.dispose();
  });

  it('queues a snapshot and projection until the initial basemap is loaded', () => {
    const map = new FakeMap();
    map.ready = false;
    const adapter = new MapLibreAdapter(map.port());
    adapter.resetSession('world');
    adapter.setProjection('globe');
    adapter.render(payload('1', true));
    expect(map.sources.size).toBe(0);
    map.ready = true;
    map.fire('style.load');
    expect(map.projection).toBe('globe');
    expect(map.data('armies').features).toHaveLength(1);
    adapter.dispose();
  });

  it('does not retain caller-owned data or reappear after disposal', () => {
    const map = new FakeMap();
    const adapter = new MapLibreAdapter(map.port());
    adapter.resetSession('world');
    const snapshot = payload('1', true);
    adapter.render(snapshot);
    (snapshot.layers.armies.features as unknown as unknown[]).length = 0;
    adapter.setBasemap('https://example.com/style.json');
    map.ready = true;
    map.fire('style.load');
    expect(map.data('armies').features).toHaveLength(1);
    adapter.dispose();
    map.fire('style.load');
    expect(map.layers.size).toBe(0);
    expect(map.sources.size).toBe(0);
    expect(map.listeners.get('style.load')?.size).toBe(0);
    expect(() => adapter.render(payload('2'))).toThrow('disposed');
    adapter.dispose();
  });

  it('clears expired data before restoring a style even if the timer was delayed', () => {
    const map = new FakeMap();
    let now = 0;
    const adapter = new MapLibreAdapter(map.port(), { now: () => now, schedule: () => () => {} });
    adapter.resetSession('world');
    adapter.render(payload('1', true));
    adapter.setBasemap('https://example.com/style.json');
    now = 11000;
    map.ready = true;
    map.fire('style.load');
    expect(map.data('armies').features).toEqual([]);
    adapter.dispose();
  });

  it.each([
    { ...payload('2'), schemaVersion: 2 },
    { ...payload('2'), revision: 'garbage' },
    { ...payload('2'), expiresAt: 1000 },
  ])('fails closed for invalid snapshot metadata', (invalid) => {
    const map = new FakeMap();
    const adapter = new MapLibreAdapter(map.port());
    adapter.resetSession('world');
    adapter.render(payload('1', true));
    expect(() => adapter.render(invalid as MapPayload)).toThrow();
    expect(map.data('armies').features).toEqual([]);
    adapter.dispose();
  });
});

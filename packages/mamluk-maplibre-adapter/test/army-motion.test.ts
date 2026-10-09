import { describe, expect, it } from 'vitest';
import type { MapPayload } from '@mamluk/world-map-core';
import { armyEta, presentArmies } from '../src/army-motion';
import { MapLibreAdapter } from '../src/adapter';
import { DEFAULT_PALETTE, overlayLayers } from '../src/styles';
import { FakeMap, payload } from './fixtures';

function journey(): MapPayload {
  const base = payload('1', true);
  return {
    ...base,
    layers: {
      ...base.layers,
      armies: {
        ...base.layers.armies,
        features: base.layers.armies.features.map((army) => ({
          ...army,
          properties: { ...army.properties, own: true, ownerPlayerId: 'viewer' },
        })),
      },
      armyRoutes: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            id: 'army',
            geometry: {
              type: 'LineString',
              coordinates: [
                [31, 30],
                [33, 32],
              ],
            },
            properties: {
              armyId: 'army',
              mission: 'attack',
              distance: 3,
              distanceUnit: 'tiles',
              departureTime: 1000,
              arrivalTime: 9000,
            },
          },
        ],
      },
    },
  };
}

describe('authorized army travel presentation', () => {
  it('starts at the supplied position, advances along the saved schedule and awaits server arrival', () => {
    const snapshot = journey();
    const before = structuredClone(snapshot);
    expect(presentArmies(snapshot, 1000, DEFAULT_PALETTE).features[0]!.geometry).toEqual(
      snapshot.layers.armies.features[0]!.geometry,
    );
    expect(presentArmies(snapshot, 5000, DEFAULT_PALETTE).features[0]).toMatchObject({
      geometry: { coordinates: [32, 31] },
      properties: { __mamlukEta: '00:00:04', __mamlukMissionSymbol: '×', __mamlukBearing: 45 },
    });
    expect(presentArmies(snapshot, 10000, DEFAULT_PALETTE).features[0]).toMatchObject({
      geometry: { coordinates: [33, 32] },
      properties: { status: 'moving', __mamlukEta: '…' },
    });
    expect(snapshot).toEqual(before);
    expect(armyEta(1000 + 3661000, 1000)).toBe('01:01:01');
  });

  it('never derives a rival path or replaces an authoritative position that disagrees with the route', () => {
    const snapshot = journey();
    const rival = {
      ...snapshot,
      layers: {
        ...snapshot.layers,
        armies: {
          ...snapshot.layers.armies,
          features: snapshot.layers.armies.features.map((army) => ({
            ...army,
            properties: { ...army.properties, own: false },
          })),
        },
      },
    };
    expect(presentArmies(rival, 5000, DEFAULT_PALETTE)).toEqual(rival.layers.armies);
    const unsupported = {
      ...snapshot,
      layers: {
        ...snapshot.layers,
        armies: {
          ...snapshot.layers.armies,
          features: snapshot.layers.armies.features.map((army) => ({
            ...army,
            geometry: { type: 'Point' as const, coordinates: [40, 30] as const },
          })),
        },
      },
    };
    expect(presentArmies(unsupported, 5000, DEFAULT_PALETTE).features[0]!.geometry).toEqual(
      unsupported.layers.armies.features[0]!.geometry,
    );
  });

  it('crosses the short antimeridian arc without sweeping around the map', () => {
    const snapshot = journey();
    const seam: MapPayload = {
      ...snapshot,
      layers: {
        ...snapshot.layers,
        armies: {
          ...snapshot.layers.armies,
          features: snapshot.layers.armies.features.map((army) => ({
            ...army,
            geometry: { type: 'Point', coordinates: [179, 0] },
          })),
        },
        armyRoutes: {
          ...snapshot.layers.armyRoutes,
          features: snapshot.layers.armyRoutes.features.map((route) => ({
            ...route,
            geometry: {
              type: 'MultiLineString',
              coordinates: [
                [
                  [179, 0],
                  [180, 0],
                ],
                [
                  [-180, 0],
                  [-179, 0],
                ],
              ],
            },
          })),
        },
      },
    };
    expect(presentArmies(seam, 5000, DEFAULT_PALETTE).features[0]!.geometry).toMatchObject({
      coordinates: [-180, 0],
    });
    expect(presentArmies(seam, 7000, DEFAULT_PALETTE).features[0]!.geometry).toMatchObject({
      coordinates: [-179.5, 0],
    });
  });

  it('keeps army sources through camera/style updates and duplicate snapshots but clears on expiry/disposal', () => {
    const map = new FakeMap();
    let now = 0;
    let frame: (() => void) | undefined;
    let cancelled = 0;
    const adapter = new MapLibreAdapter(map.port(), {
      animateArmies: true,
      now: () => now,
      requestFrame: (task) => {
        frame = task;
        return () => {
          frame = undefined;
          cancelled++;
        };
      },
    });
    adapter.resetSession('world');
    adapter.render(journey());
    const source = map.getSource('mamluk-armies');
    now = 4000;
    frame!();
    expect(map.data('armies').features[0].geometry.coordinates).toEqual([32, 31]);
    adapter.render(journey());
    expect(map.data('armies').features[0].geometry.coordinates).toEqual([32, 31]);
    map.fire('moveend');
    adapter.setProjection('globe');
    expect(map.getSource('mamluk-armies')).toBe(source);
    adapter.setBasemap('test-style');
    map.ready = true;
    map.fire('style.load');
    expect(map.data('armies').features[0].geometry.coordinates).toEqual([32, 31]);
    expect(map.layers.has('mamluk-army-timers')).toBe(true);
    now = 10000;
    const expiredFrame = frame!;
    frame = undefined;
    expiredFrame();
    expect(map.data('armies').features).toEqual([]);
    expect(frame).toBeUndefined();
    adapter.dispose();
    expect(cancelled).toBeGreaterThan(0);
  });

  it('steps reduced motion once per second and cancels its timers when authorization is removed', () => {
    const map = new FakeMap();
    const jobs: { task: () => void; delay: number; cancelled: boolean }[] = [];
    let now = 0;
    const adapter = new MapLibreAdapter(map.port(), {
      animateArmies: true,
      now: () => now,
      reducedMotion: () => true,
      schedule: (task, delay) => {
        const job = { task, delay, cancelled: false };
        jobs.push(job);
        return () => {
          job.cancelled = true;
        };
      },
      requestFrame: () => {
        throw new Error('Reduced motion must not request animation frames');
      },
    });
    adapter.resetSession('world');
    adapter.render(journey());
    expect(jobs.map((job) => job.delay)).toEqual([10000, 1000]);
    now = 1000;
    jobs[1]!.task();
    expect(map.data('armies').features[0].geometry.coordinates).toEqual([31.25, 30.25]);
    adapter.clear();
    expect(jobs.at(-1)!.cancelled).toBe(true);
    expect(map.data('armies').features).toEqual([]);
    adapter.dispose();
  });

  it('renders mission icons, route colors, direction and ETA in the actual circle-layer mode', () => {
    const layers = overlayLayers(DEFAULT_PALETTE, false, false, true);
    expect(layers.find((layer) => layer.id === 'mamluk-armies')?.type).toBe('circle');
    for (const id of ['mamluk-army-missions', 'mamluk-army-direction', 'mamluk-army-timers'])
      expect(layers.find((layer) => layer.id === id)).toMatchObject({
        source: id === 'mamluk-army-timers' ? 'mamluk-army-timer-labels' : 'mamluk-armies',
        type: 'symbol',
      });
    expect(layers.at(-1)!.id).toBe('mamluk-fog');
  });
});

it('uses a monotonic display clock despite wall-clock jumps and cancels motion on a session change', async () => {
  const { vi } = await import('vitest');
  const map = new FakeMap();
  let elapsed = 0;
  let frame: (() => void) | undefined;
  const mono = vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
  const wall = vi.spyOn(Date, 'now').mockReturnValue(9000000000);
  try {
    const base = payload('1', true);
    const snapshot: MapPayload = {
      ...base,
      layers: {
        ...base.layers,
        armies: {
          ...base.layers.armies,
          features: base.layers.armies.features.map((army) => ({
            ...army,
            properties: { ...army.properties, own: true },
          })),
        },
        armyRoutes: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              id: 'army',
              geometry: {
                type: 'LineString',
                coordinates: [
                  [31, 30],
                  [33, 32],
                ],
              },
              properties: {
                armyId: 'army',
                mission: 'return',
                distance: 3,
                departureTime: 1000,
                arrivalTime: 9000,
              },
            },
          ],
        },
      },
    };
    const adapter = new MapLibreAdapter(map.port(), {
      animateArmies: true,
      requestFrame: (task) => {
        frame = task;
        return () => {
          frame = undefined;
        };
      },
    });
    adapter.resetSession('world');
    adapter.render(snapshot);
    wall.mockReturnValue(-9000000000);
    elapsed = 2000;
    frame!();
    expect(map.data('armies').features[0].geometry.coordinates).toEqual([31.5, 30.5]);
    wall.mockReturnValue(9000000000000);
    elapsed = 4000;
    frame!();
    expect(map.data('armies').features[0].geometry.coordinates).toEqual([32, 31]);
    adapter.resetSession('other-world');
    expect(map.data('armies').features).toEqual([]);
    expect(frame).toBeUndefined();
    adapter.dispose();
  } finally {
    mono.mockRestore();
    wall.mockRestore();
  }
});

it('waits for an asynchronous GeoJSON upload before submitting another movement frame', async () => {
  const { vi } = await import('vitest');
  const map = new FakeMap();
  let now = 0;
  let frame: (() => void) | undefined;
  const adapter = new MapLibreAdapter(map.port(), {
    animateArmies: true,
    now: () => now,
    requestFrame: (task) => {
      frame = task;
      return () => {
        frame = undefined;
      };
    },
  });
  const base = payload('1', true);
  const snapshot: MapPayload = {
    ...base,
    layers: {
      ...base.layers,
      armies: {
        ...base.layers.armies,
        features: base.layers.armies.features.map((army) => ({
          ...army,
          properties: { ...army.properties, own: true },
        })),
      },
      armyRoutes: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            id: 'army',
            geometry: {
              type: 'LineString',
              coordinates: [
                [31, 30],
                [33, 32],
              ],
            },
            properties: { armyId: 'army', distance: 3, departureTime: 1000, arrivalTime: 9000 },
          },
        ],
      },
    },
  };
  adapter.resetSession('world');
  adapter.render(snapshot);
  let finishUpload!: () => void;
  const source = map.getSource('mamluk-armies')!;
  const update = vi.spyOn(source, 'setData').mockImplementation((data) => {
    source.data = data;
    return new Promise<void>((resolve) => {
      finishUpload = resolve;
    });
  });
  now = 1000;
  frame!();
  now = 2000;
  frame!();
  expect(update).toHaveBeenCalledTimes(1);
  finishUpload();
  await Promise.resolve();
  await Promise.resolve();
  now = 3000;
  frame!();
  expect(update).toHaveBeenCalledTimes(2);
  expect(source.data.features[0].geometry.coordinates).toEqual([31.75, 30.75]);
  adapter.dispose();
  finishUpload();
});

it.each(['clear', 'resetSession', 'dispose', 'ttl'] as const)(
  'never restores old army data when %s happens during an upload',
  async (action) => {
    const { vi } = await import('vitest');
    const map = new FakeMap();
    let now = 0;
    let frame: (() => void) | undefined;
    const adapter = new MapLibreAdapter(map.port(), {
      animateArmies: true,
      now: () => now,
      requestFrame: (task) => {
        frame = task;
        return () => {
          frame = undefined;
        };
      },
    });
    adapter.resetSession('world');
    adapter.render(journey());
    let complete!: () => void;
    vi.spyOn(map.getSource('mamluk-armies')!, 'setData').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    now = 1000;
    frame!();
    adapter.render({ ...journey(), revision: '2', serverTime: 2000 });
    if (action === 'resetSession') adapter.resetSession('other');
    else if (action === 'ttl') {
      now = 10000;
      const expiredFrame = frame!;
      frame = undefined;
      expiredFrame();
    } else adapter[action]();
    expect(map.data('armies').features).toEqual([]);
    expect(frame).toBeUndefined();
    complete();
    await Promise.resolve();
    await Promise.resolve();
    expect(map.data('armies').features).toEqual([]);
    expect(map.layers.has('mamluk-army-timers')).toBe(false);
    adapter.dispose();
  },
);

it('retries a failed movement upload without overlap and uses the latest authorized snapshot', async () => {
  const { vi } = await import('vitest');
  const map = new FakeMap();
  let now = 0;
  let frame: (() => void) | undefined;
  const adapter = new MapLibreAdapter(map.port(), {
    animateArmies: true,
    now: () => now,
    requestFrame: (task) => {
      frame = task;
      return () => {
        frame = undefined;
      };
    },
  });
  adapter.resetSession('world');
  adapter.render(journey());
  let reject!: (error: Error) => void;
  const source = map.getSource('mamluk-armies')!;
  const update = vi
    .spyOn(source, 'setData')
    .mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, fail) => {
          reject = fail;
        }),
    )
    .mockImplementation((data) => {
      source.data = data;
      return Promise.resolve();
    });
  now = 1000;
  frame!();
  now = 2000;
  frame!();
  expect(update).toHaveBeenCalledTimes(1);
  reject(new Error('Worker failed'));
  await Promise.resolve();
  await Promise.resolve();
  now = 3000;
  frame!();
  expect(update).toHaveBeenCalledTimes(2);
  await Promise.resolve();
  await Promise.resolve();
  const next = journey();
  adapter.render({
    ...next,
    revision: '2',
    serverTime: 5000,
    layers: {
      ...next.layers,
      armies: {
        ...next.layers.armies,
        features: next.layers.armies.features.map((army) => ({
          ...army,
          geometry: { type: 'Point', coordinates: [32, 31] },
        })),
      },
    },
  });
  expect(source.data.features[0].geometry.coordinates).toEqual([32, 31]);
  await Promise.resolve();
  await Promise.resolve();
  now = 4000;
  frame!();
  expect(source.data.features[0].geometry.coordinates).toEqual([32.25, 31.25]);
  adapter.dispose();
});

it('queues the latest snapshot while an army upload is pending and submits it without overlap', async () => {
  const { vi } = await import('vitest');
  const map = new FakeMap();
  let now = 0;
  let frame: (() => void) | undefined;
  const adapter = new MapLibreAdapter(map.port(), {
    animateArmies: true,
    now: () => now,
    requestFrame: (task) => {
      frame = task;
      return () => {
        frame = undefined;
      };
    },
  });
  adapter.resetSession('world');
  adapter.render(journey());
  const source = map.getSource('mamluk-armies')!;
  const uploads: (() => void)[] = [];
  const update = vi.spyOn(source, 'setData').mockImplementation(
    (data) =>
      new Promise<void>((resolve) => {
        uploads.push(() => {
          source.data = data;
          resolve();
        });
      }),
  );
  now = 1000;
  frame!();
  const next = journey();
  adapter.render({
    ...next,
    revision: '2',
    serverTime: 5000,
    layers: {
      ...next.layers,
      armies: {
        ...next.layers.armies,
        features: next.layers.armies.features.map((army) => ({
          ...army,
          geometry: { type: 'Point', coordinates: [32, 31] },
        })),
      },
    },
  });
  expect(update).toHaveBeenCalledTimes(1);
  uploads.shift()!();
  await Promise.resolve();
  await Promise.resolve();
  expect(update).toHaveBeenCalledTimes(2);
  expect(update.mock.calls[1]![0]).toMatchObject({
    features: [{ geometry: { coordinates: [32, 31] } }],
  });
  uploads.shift()!();
  await Promise.resolve();
  await Promise.resolve();
  expect(source.data.features[0].geometry.coordinates).toEqual([32, 31]);
  adapter.dispose();
});

it('keeps circles moving between second ticks while timer annotations only contain authorized own routes', async () => {
  const { vi } = await import('vitest');
  const map = new FakeMap();
  let now = 0;
  let frame: (() => void) | undefined;
  const adapter = new MapLibreAdapter(map.port(), {
    animateArmies: true,
    now: () => now,
    requestFrame: (task) => {
      frame = task;
      return () => {
        frame = undefined;
      };
    },
  });
  adapter.resetSession('world');
  const own = journey();
  adapter.render({
    ...own,
    layers: {
      ...own.layers,
      armies: {
        ...own.layers.armies,
        features: [
          ...own.layers.armies.features,
          {
            ...own.layers.armies.features[0]!,
            id: 'rival',
            properties: { own: false, ownerPlayerId: 'rival' },
          },
        ],
      },
    },
  });
  const labels = map.getSource('mamluk-army-timer-labels')!;
  expect(labels.data.features.map((entry: { id: string }) => entry.id)).toEqual(['army']);
  const update = vi.spyOn(labels, 'setData');
  const initial = map.data('armies').features[0].geometry;
  now = 50;
  frame!();
  expect(map.data('armies').features[0].geometry).not.toEqual(initial);
  now = 999;
  frame!();
  expect(update).not.toHaveBeenCalled();
  now = 1000;
  frame!();
  expect(update).toHaveBeenCalledTimes(1);
  const circle = map.data('armies').features[0].geometry;
  now = 1050;
  frame!();
  expect(map.data('armies').features[0].geometry).not.toEqual(circle);
  expect(update).toHaveBeenCalledTimes(1);
  adapter.dispose();
  expect(map.getSource('mamluk-army-timer-labels')).toBeUndefined();
});

it.each(['clear', 'resetSession', 'dispose', 'ttl'] as const)(
  'cannot restore timer annotations after %s while a worker upload is pending',
  async (action) => {
    const { vi } = await import('vitest');
    const map = new FakeMap();
    let now = 0;
    let frame: (() => void) | undefined;
    const adapter = new MapLibreAdapter(map.port(), {
      animateArmies: true,
      now: () => now,
      requestFrame: (task) => {
        frame = task;
        return () => {
          frame = undefined;
        };
      },
    });
    adapter.resetSession('world');
    adapter.render(journey());
    let complete!: () => void;
    const labels = map.getSource('mamluk-army-timer-labels')!;
    vi.spyOn(labels, 'setData').mockImplementation(
      (data) =>
        new Promise<void>((resolve) => {
          complete = () => {
            labels.data = data;
            resolve();
          };
        }),
    );
    now = 1000;
    frame!();
    adapter.render({ ...journey(), revision: '2', serverTime: 2000 });
    if (action === 'resetSession') adapter.resetSession('other');
    else if (action === 'ttl') {
      now = 10000;
      const expiredFrame = frame!;
      frame = undefined;
      expiredFrame();
    } else adapter[action]();
    complete();
    await Promise.resolve();
    await Promise.resolve();
    expect(map.getSource('mamluk-army-timer-labels')).toBeUndefined();
    expect(map.layers.has('mamluk-army-timers')).toBe(false);
    expect(frame).toBeUndefined();
    adapter.dispose();
  },
);

it('serializes annotation uploads, flushes the latest snapshot and retries a rejected timer update', async () => {
  const { vi } = await import('vitest');
  const map = new FakeMap();
  let now = 0;
  let frame: (() => void) | undefined;
  const adapter = new MapLibreAdapter(map.port(), {
    animateArmies: true,
    now: () => now,
    requestFrame: (task) => {
      frame = task;
      return () => {
        frame = undefined;
      };
    },
  });
  adapter.resetSession('world');
  adapter.render(journey());
  const labels = map.getSource('mamluk-army-timer-labels')!;
  let complete!: () => void;
  let reject!: (error: Error) => void;
  const update = vi
    .spyOn(labels, 'setData')
    .mockImplementationOnce(
      (data) =>
        new Promise<void>((resolve) => {
          complete = () => {
            labels.data = data;
            resolve();
          };
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, fail) => {
          reject = fail;
        }),
    )
    .mockImplementation((data) => {
      labels.data = data;
      return Promise.resolve();
    });
  now = 1000;
  frame!();
  const next = journey();
  adapter.render({
    ...next,
    revision: '2',
    serverTime: 5000,
    layers: {
      ...next.layers,
      armies: {
        ...next.layers.armies,
        features: next.layers.armies.features.map((army) => ({
          ...army,
          geometry: { type: 'Point', coordinates: [32, 31] },
        })),
      },
    },
  });
  expect(update).toHaveBeenCalledTimes(1);
  now = 1050;
  frame!();
  expect(update).toHaveBeenCalledTimes(1);
  complete();
  await Promise.resolve();
  await Promise.resolve();
  expect(update).toHaveBeenCalledTimes(2);
  expect(update.mock.calls[1]![0]).toMatchObject({
    features: [
      { geometry: { coordinates: [expect.closeTo(32.0125, 9), expect.closeTo(31.0125, 9)] } },
    ],
  });
  reject(new Error('Worker failed'));
  await Promise.resolve();
  await Promise.resolve();
  now = 2050;
  frame!();
  expect(update).toHaveBeenCalledTimes(3);
  adapter.dispose();
});

import { describe, expect, it, vi } from 'vitest';
import type { LayerSpecification, Map as LibreMap } from 'maplibre-gl';
import { createSettlementPresentation } from './settlement-presentation';

type SpriteMap = Pick<
  LibreMap,
  'loadImage' | 'addImage' | 'hasImage' | 'on' | 'off' | 'isStyleLoaded'
>;
const colors = { label: '#2f271c', halo: '#fff8e5' };
const image = { width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) };

function sdkFixture(styleLoaded = true) {
  const images = new Map<string, unknown>();
  const listeners = new Map<string, Set<() => void>>();
  const pending: {
    url: string;
    resolve: (value: { data: typeof image }) => void;
    reject: (reason: Error) => void;
  }[] = [];
  const sdk = {
    loadImage: vi.fn(
      (url: string) =>
        new Promise<{ data: typeof image }>((resolve, reject) => {
          pending.push({ url, resolve, reject });
        }),
    ),
    addImage: vi.fn((id: string, data: unknown) => {
      images.set(id, data);
    }),
    hasImage: (id: string) => images.has(id),
    isStyleLoaded: () => styleLoaded,
    on: (event: string, listener: () => void) => {
      const callbacks = listeners.get(event) ?? new Set();
      callbacks.add(listener);
      listeners.set(event, callbacks);
    },
    off: (event: string, listener: () => void) => {
      listeners.get(event)?.delete(listener);
    },
  };
  return {
    map: sdk as unknown as SpriteMap,
    sdk,
    images,
    listeners,
    complete: () => pending.forEach(({ resolve }) => resolve({ data: image })),
    failOne: (failed: number) =>
      pending.forEach(({ resolve, reject }, index) => {
        if (index === failed) reject(new Error('Static artwork unavailable'));
        else resolve({ data: image });
      }),
    fireStyle: () => {
      styleLoaded = true;
      for (const callback of listeners.get('style.load') ?? []) callback();
    },
  };
}

function circle(id = 'mamluk-cities', source = id): LayerSpecification {
  return {
    id,
    source,
    type: 'circle',
    minzoom: 3,
    filter: ['==', ['get', 'kind'], 'city'],
    paint: { 'circle-radius': 5 },
  };
}

describe('settlement artwork security boundary', () => {
  it('changes approved settlements into anchored sprites without changing their source, ID or input', async () => {
    const fixture = sdkFixture();
    const presentation = createSettlementPresentation(
      fixture.map,
      colors,
      new AbortController().signal,
    );
    const original = circle();
    const before = structuredClone(original);
    expect(presentation.layer(original)).toEqual(original);
    fixture.complete();
    expect(await presentation.ready).toBe(true);
    const layer = presentation.layer(original);

    expect(layer).toMatchObject({
      id: 'mamluk-cities',
      source: 'mamluk-cities',
      type: 'symbol',
      minzoom: 3,
      layout: {
        'icon-anchor': 'bottom',
        'icon-pitch-alignment': 'viewport',
        'icon-rotation-alignment': 'viewport',
        'text-pitch-alignment': 'viewport',
        'text-rotation-alignment': 'viewport',
      },
    });
    expect(layer).toHaveProperty('filter', ['==', ['get', 'kind'], 'city']);
    expect(original).toEqual(before);
    expect(fixture.sdk.loadImage.mock.calls).toHaveLength(2);
    const urls = fixture.sdk.loadImage.mock.calls.map(([url]) => url);
    expect(urls.every((url) => url.startsWith('/') && !url.startsWith('//'))).toBe(true);
    expect(urls.map((url) => url.split('/').at(-1)).sort()).toEqual(['castle.png', 'village.png']);
    presentation.dispose();
  });

  it('uses separate village and castle artwork without creating additional game sources', async () => {
    const fixture = sdkFixture();
    const presentation = createSettlementPresentation(
      fixture.map,
      colors,
      new AbortController().signal,
    );
    fixture.complete();
    expect(await presentation.ready).toBe(true);
    const village = presentation.layer(circle());
    const castle = presentation.layer(circle('mamluk-castles'));

    expect(village.type).toBe('symbol');
    expect(castle).toMatchObject({
      id: 'mamluk-castles',
      source: 'mamluk-castles',
      type: 'symbol',
      layout: { 'icon-anchor': 'bottom' },
    });
    if (village.type !== 'symbol' || castle.type !== 'symbol')
      throw new Error('Missing approved sprites');
    const villageImage = village.layout?.['icon-image'];
    const castleImage = castle.layout?.['icon-image'];
    expect(typeof villageImage).toBe('string');
    expect(typeof castleImage).toBe('string');
    expect(villageImage).not.toBe(castleImage);
    expect(fixture.images.has(villageImage as string)).toBe(true);
    expect(fixture.images.has(castleImage as string)).toBe(true);
    expect(fixture.images.size).toBe(2);
    presentation.dispose();
  });

  it('never changes private military, fog, basemap or mismatched settlement sources', async () => {
    const fixture = sdkFixture();
    const presentation = createSettlementPresentation(
      fixture.map,
      colors,
      new AbortController().signal,
    );
    fixture.complete();
    expect(await presentation.ready).toBe(true);

    for (const layer of [
      circle('mamluk-armies'),
      circle('mamluk-armyRoutes'),
      circle('mamluk-sieges'),
      circle('mamluk-fog'),
      circle('mamluk-visibility'),
      circle('osm-towns'),
      circle('mamluk-cities', 'enemy-army-source'),
      circle('mamluk-castles', 'mamluk-cities'),
      { id: 'mamluk-cities', source: 'mamluk-cities', type: 'line' as const },
    ]) {
      const before = structuredClone(layer);
      expect(presentation.layer(layer)).toEqual(before);
      expect(layer).toEqual(before);
    }
    presentation.dispose();
  });

  it.each([0, 1])(
    'keeps circle markers usable if artwork asset %i fails and does not retry on style events',
    async (failed) => {
      const fixture = sdkFixture();
      const presentation = createSettlementPresentation(
        fixture.map,
        colors,
        new AbortController().signal,
      );
      fixture.failOne(failed);
      expect(await presentation.ready).toBe(false);
      fixture.fireStyle();
      fixture.fireStyle();

      expect(fixture.sdk.loadImage).toHaveBeenCalledTimes(2);
      expect(fixture.images.size).toBe(0);
      expect(presentation.layer(circle())).toEqual(circle());
      expect(presentation.layer(circle('mamluk-castles'))).toEqual(circle('mamluk-castles'));
      presentation.dispose();
    },
  );

  it('waits for a loaded style and synchronously restores static sprites after style replacement', async () => {
    const fixture = sdkFixture(false);
    const presentation = createSettlementPresentation(
      fixture.map,
      colors,
      new AbortController().signal,
    );
    fixture.complete();
    expect(await presentation.ready).toBe(true);
    expect(fixture.images.size).toBe(0);
    expect(presentation.layer(circle())).toEqual(circle());
    let imagesReadyBeforeNextStyleListener = false;
    fixture.map.on('style.load', () => {
      imagesReadyBeforeNextStyleListener = fixture.images.size === 2;
    });
    fixture.fireStyle();
    expect(imagesReadyBeforeNextStyleListener).toBe(true);
    expect(presentation.layer(circle()).type).toBe('symbol');
    fixture.images.clear();
    fixture.fireStyle();
    expect(fixture.images.size).toBe(2);
    expect(fixture.sdk.loadImage).toHaveBeenCalledTimes(2);
    presentation.dispose();
  });

  it('does not register duplicate images when the style already retains them', async () => {
    const fixture = sdkFixture();
    const presentation = createSettlementPresentation(
      fixture.map,
      colors,
      new AbortController().signal,
    );
    fixture.complete();
    expect(await presentation.ready).toBe(true);
    const count = fixture.sdk.addImage.mock.calls.length;
    fixture.fireStyle();
    fixture.fireStyle();

    expect(fixture.sdk.addImage).toHaveBeenCalledTimes(count);
    expect(fixture.images.size).toBe(2);
    presentation.dispose();
  });

  it('retains both circle types when SDK registration fails after the first image succeeds', async () => {
    const fixture = sdkFixture();
    fixture.sdk.addImage
      .mockImplementationOnce((id, data) => {
        fixture.images.set(id, data);
      })
      .mockImplementationOnce(() => {
        throw new Error('Sprite registration unavailable');
      });
    const presentation = createSettlementPresentation(
      fixture.map,
      colors,
      new AbortController().signal,
    );
    fixture.complete();

    expect(await presentation.ready).toBe(false);
    expect(presentation.layer(circle())).toEqual(circle());
    expect(presentation.layer(circle('mamluk-castles'))).toEqual(circle('mamluk-castles'));
    presentation.dispose();
  });

  it('contains SDK registration errors during style reload and falls back to both circle types', async () => {
    const fixture = sdkFixture();
    const presentation = createSettlementPresentation(
      fixture.map,
      colors,
      new AbortController().signal,
    );
    fixture.complete();
    expect(await presentation.ready).toBe(true);
    fixture.images.clear();
    fixture.sdk.addImage.mockImplementation(() => {
      throw new Error('Reload registration unavailable');
    });

    expect(() => fixture.fireStyle()).not.toThrow();
    expect(presentation.layer(circle())).toEqual(circle());
    expect(presentation.layer(circle('mamluk-castles'))).toEqual(circle('mamluk-castles'));
    presentation.dispose();
  });

  it('does not load assets or attach listeners when the caller has already aborted', async () => {
    const fixture = sdkFixture();
    const controller = new AbortController();
    controller.abort();
    const presentation = createSettlementPresentation(fixture.map, colors, controller.signal);

    expect(await presentation.ready).toBe(false);
    expect(fixture.sdk.loadImage).not.toHaveBeenCalled();
    expect(fixture.listeners.get('style.load')?.size ?? 0).toBe(0);
    expect(presentation.layer(circle())).toEqual(circle());
    presentation.dispose();
  });

  it.each(['abort', 'dispose'] as const)(
    'settles pending readiness on %s and never restores late images or listeners',
    async (action) => {
      const fixture = sdkFixture();
      const controller = new AbortController();
      const presentation = createSettlementPresentation(fixture.map, colors, controller.signal);
      if (action === 'abort') controller.abort();
      else presentation.dispose();
      expect(await presentation.ready).toBe(false);
      fixture.complete();
      await Promise.resolve();
      await Promise.resolve();
      fixture.fireStyle();

      expect(fixture.images.size).toBe(0);
      expect(fixture.listeners.get('style.load')?.size ?? 0).toBe(0);
      expect(presentation.layer(circle())).toEqual(circle());
      presentation.dispose();
    },
  );

  it('does not reinstall loaded images after disposal and tolerates repeated cleanup', async () => {
    const fixture = sdkFixture();
    const presentation = createSettlementPresentation(
      fixture.map,
      colors,
      new AbortController().signal,
    );
    fixture.complete();
    expect(await presentation.ready).toBe(true);
    presentation.dispose();
    presentation.dispose();
    fixture.images.clear();
    fixture.fireStyle();

    expect(fixture.images.size).toBe(0);
    expect(fixture.listeners.get('style.load')?.size ?? 0).toBe(0);
    expect(presentation.layer(circle())).toEqual(circle());
  });
});

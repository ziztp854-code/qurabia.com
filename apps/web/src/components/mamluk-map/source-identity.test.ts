import { expect, it } from 'vitest';
import type { Source } from 'maplibre-gl';
import { approvedPayload } from './map-fixture';
import { withFeatureIdentity, withSourceIdentity } from './source-identity';
import { withPlayerOwnership } from './player-ownership';

it('preserves non-collection GeoJSON and source URLs without introducing selection data', () => {
  expect(withFeatureIdentity('/approved.json')).toBe('/approved.json');
  const point = { type: 'Point' as const, coordinates: [31, 30] };
  expect(withFeatureIdentity(point)).toBe(point);
});

it('preserves SDK source receivers, getters, and unrelated source types', () => {
  const source = {
    type: 'geojson',
    data: approvedPayload().layers.cities,
    get current() {
      return this.data;
    },
    read() {
      return this.data;
    },
    setData(data: typeof this.data) {
      this.data = data;
      return this;
    },
  };
  const wrapped = withSourceIdentity(source as unknown as Source);
  const sdk = wrapped as unknown as typeof source;
  expect(sdk.read()).toBe(source.data);
  expect(sdk.current).toBe(source.data);
  sdk.setData(approvedPayload().layers.cities);
  expect(source.data.features[0]?.properties).toHaveProperty('__mamlukFeatureId', 'cairo');
  const raster = { type: 'raster' } as Source;
  expect(withSourceIdentity(raster)).toBe(raster);
});

it('applies approved ownership presentation on source updates while retaining domain feature IDs', () => {
  const source = {
    type: 'geojson',
    data: approvedPayload().layers.cities,
    setData(data: typeof this.data) {
      this.data = data;
      return this;
    },
  };
  const wrapped = withSourceIdentity(source as unknown as Source, (data) =>
    withPlayerOwnership(data, {
      viewerPlayerId: 'viewer',
      colors: {
        own: 'gold',
        neutral: 'stone',
        selected: 'ivory',
        halo: 'ink',
        players: ['forest'],
      },
    }),
  );
  const sdk = wrapped as unknown as typeof source;
  expect(sdk.setData(approvedPayload().layers.cities)).toBe(source);
  expect(source.data.features[0]?.properties).toMatchObject({
    ownerPlayerId: 'viewer',
    __mamlukFeatureId: 'cairo',
    __mamlukOwnerColor: 'gold',
    __mamlukOwn: true,
  });
});

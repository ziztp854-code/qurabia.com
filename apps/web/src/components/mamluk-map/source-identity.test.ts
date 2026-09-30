import { expect, it } from 'vitest';
import type { Source } from 'maplibre-gl';
import { approvedPayload } from './map-fixture';
import { withFeatureIdentity, withSourceIdentity } from './source-identity';

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

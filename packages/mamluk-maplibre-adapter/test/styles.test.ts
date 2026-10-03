import { describe, expect, it } from 'vitest';
import { markerSvgs } from '../src/markers';
import { overlayLayers, DEFAULT_PALETTE } from '../src/styles';
describe('HD presentation', () => {
  it('provides unique vector tier silhouettes and military icons without remote assets', () => {
    const icons = markerSvgs();
    expect(icons.length).toBeGreaterThanOrEqual(11);
    expect(new Set(icons.map((icon) => icon.svg)).size).toBe(icons.length);
    expect(icons.every((icon) => icon.svg.includes('viewBox="0 0 48 48"'))).toBe(true);
    expect(icons.map((icon) => icon.svg).join('')).not.toMatch(/<image|http[s]?:\/\/[^w]/);
  });
  it('uses collision-managed symbols and only local-zoom villages', () => {
    const layers = overlayLayers(DEFAULT_PALETTE, true, true);
    const markers = layers.find((layer) => layer.id === 'mamluk-cities')!;
    expect(markers.type).toBe('symbol');
    expect(markers.minzoom).toBe(4);
    expect(layers.find((layer) => layer.id === 'mamluk-cluster-count')).toBeDefined();
    expect(layers.find((layer) => layer.id === 'mamluk-route-arrows')).toBeDefined();
  });
});

it('reveals major cities at regional zoom and real level labels only at local zoom', () => {
  const city = overlayLayers(DEFAULT_PALETTE, true, true).find(
    (layer) => layer.id === 'mamluk-cities',
  )!;
  expect(city.minzoom).toBe(4);
  if (city.type !== 'symbol') throw new Error('Expected a city symbol');
  expect(JSON.stringify(city.filter)).toContain('strategicValue');
  expect(JSON.stringify(city.filter)).toContain('villageLevel');
  if (city.type !== 'symbol') throw new Error('Expected a city symbol');
  expect(JSON.stringify(city.layout?.['text-field'])).toContain('villageLevel');
  expect(JSON.stringify(city.layout?.['text-field'])).toContain('zoom');
  const count = overlayLayers(DEFAULT_PALETTE, true, true).find(
    (layer) => layer.id === 'mamluk-cluster-count',
  )!;
  if (count.type !== 'symbol') throw new Error('Expected cluster count');
  expect(JSON.stringify(count.layout?.['text-field'])).toContain(' موقع');
});

it('preserves public geography beneath fog while keeping fog on top of entities', () => {
  const layers = overlayLayers(DEFAULT_PALETTE, true, true);
  const fog = layers.at(-1)!;
  expect(fog.id).toBe('mamluk-fog');
  if (fog.type !== 'fill') throw new Error('Expected fog fill');
  expect(fog.paint?.['fill-opacity']).toEqual([
    'interpolate',
    ['linear'],
    ['zoom'],
    0,
    0.08,
    4,
    0.14,
    10,
    0.25,
  ]);
});

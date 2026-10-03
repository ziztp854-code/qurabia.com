import { describe, expect, it } from 'vitest';
import { createHistoricalBasemap, readMapColors } from './historical-basemap';

describe('historical geographic basemap', () => {
  it('uses tiled geography, existing Cairo, and bounded relief beneath labels', () => {
    const style = createHistoricalBasemap(readMapColors(document.createElement('div')));
    expect(style.sources.geography.type).toBe('vector');
    expect(style.sources.relief).toMatchObject({
      type: 'raster-dem',
      maxzoom: 12,
      encoding: 'terrarium',
    });
    expect(style['font-faces']).toHaveProperty('Cairo');
    expect(style.layers.findIndex((layer) => layer.id === 'atlas-relief')).toBeLessThan(
      style.layers.findIndex((layer) => layer.id === 'atlas-regions'),
    );
    expect(style.layers.some((layer) => /airport|motorway|building/.test(layer.id))).toBe(false);
  });
  it('separates geographic label scales with collision management and Arabic preference', () => {
    const style = createHistoricalBasemap(readMapColors(document.createElement('div')));
    for (const layer of style.layers.filter((layer) => layer.type === 'symbol')) {
      expect(layer.layout?.['text-allow-overlap']).toBe(false);
      expect(JSON.stringify(layer.layout?.['text-field'])).toContain('name:ar');
    }
    expect(style.layers.find((layer) => layer.id === 'atlas-roads')?.minzoom).toBe(10);
  });
});

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('world map entry-point architecture', () => {
  it('keeps the world route and campaign selector on the same implementation', () => {
    for (const path of ['app/games/kingdoms/world-map/page.tsx', 'components/kingdoms/map-panel.tsx']) {
      const source = readFileSync(resolve('src', path), 'utf8');
      expect(source).toContain('import { MamlukWorldMap }');
      expect(source).toContain('<MamlukWorldMap');
      expect(source).not.toMatch(/<(?:WorldMap|KingdomsGlobe|MapCanvas)\b/);
    }
    const client = readFileSync(resolve('src/components/kingdoms/kingdoms-client.tsx'), 'utf8');
    expect(client).toContain('geographicMapHref');
    expect(client).toContain('<MapPanel');
    for (const name of ['world-map.tsx', 'world-map-artwork.tsx', 'world-map-overlays.tsx', 'use-world-map-navigation.ts']) {
      expect(existsSync(resolve('src/components/kingdoms', name))).toBe(false);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { interactionRects, rectsOverlap, villageBuildingPlots } from './coordinates';

describe('village interaction rects', () => {
  it('keeps barracks, stable, and rally from overlapping even at a phone-sized target', () => {
    const hits = interactionRects(44 / 0.25);
    expect(rectsOverlap(hits.barracks, hits.stable, 0)).toBe(false);
    expect(rectsOverlap(hits.stable, hits.rally, 0)).toBe(false);
    expect(rectsOverlap(hits.barracks, hits.rally, 0)).toBe(false);
    expect(rectsOverlap(hits.gate, hits.tower, 0)).toBe(false);
    for (const id of ['barracks', 'stable', 'rally', 'gate', 'tower'] as const) {
      const visual = villageBuildingPlots[id];
      const hit = hits[id];
      expect(hit.x).toBeLessThanOrEqual(visual.x);
      expect(hit.y).toBeLessThanOrEqual(visual.y);
      expect(hit.x + hit.width).toBeGreaterThanOrEqual(visual.x + visual.width);
      expect(hit.y + hit.height).toBeGreaterThanOrEqual(visual.y + visual.height);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { getVillageLabelDensity, villageLabelPoint, visibleVillageLabels } from './labelLayout';

describe('village labels at camera scale', () => {
  const camera = { x: 800, y: 450, scale: 1, zoom: 1, viewport: { width: 1600, height: 900 } };
  it('keeps the selected label and suppresses overlapping neighbours', () => {
    const labels = [
      { id: 'market', x: 800, y: 400 },
      { id: 'hall', x: 820, y: 410 },
      { id: 'farm', x: 1200, y: 400 },
    ];
    expect(visibleVillageLabels(labels, camera, 'hall')).toEqual(['hall', 'farm']);
  });
  it('excludes labels outside the viewport while retaining their building hotspots', () => {
    expect(visibleVillageLabels([{ id: 'mine', x: -200, y: 100 }, { id: 'stable', x: 800, y: 500 }], camera, null)).toEqual(['stable']);
  });
  it('keeps a selected edge label inside the viewport and reserves its adjusted position', () => {
    const edge = { id: 'mine', x: 1500, y: 15 };
    expect(villageLabelPoint(edge, camera, 'mine')).toEqual({ x: 1500, y: 48 });
    expect(visibleVillageLabels([edge, { id: 'quarry', x: 1500, y: 60 }], camera, 'mine')).toEqual(['mine']);
  });
  it('excludes labels covered by a village overlay', () => {
    expect(visibleVillageLabels([{ id: 'hall', x: 800, y: 80 }], camera, null,
      [{ x: 700, y: 0, width: 200, height: 100 }])).toEqual([]);
  });
  it('places a selected label beneath a floating HUD instead of hiding it', () => {
    const label = { id: 'quarry', x: 600, y: 20 };
    expect(villageLabelPoint(label, camera, 'quarry', 122)).toEqual({ x: 600, y: 170 });
    expect(visibleVillageLabels([label], camera, 'quarry',
      [{ x: 0, y: 0, width: 1600, height: 122 }], 122)).toEqual(['quarry']);
  });

  it('gives the palace priority over overlapping ordinary buildings', () => {
    const labels = [{ id: 'market', x: 800, y: 400 }, { id: 'hall', x: 820, y: 410 }];
    expect(visibleVillageLabels(labels, camera, null)).toEqual(['hall']);
    expect(visibleVillageLabels(labels, camera, 'market')).toEqual(['market']);
  });
  it('shows more labels as mobile zoom increases while retaining selection and palace', () => {
    const mobile = { x: 187.5, y: 406, scale: 1, zoom: 1, viewport: { width: 375, height: 812 } };
    const labels = [
      { id: 'farm', x: 80, y: 120 }, { id: 'hall', x: 230, y: 120 },
      { id: 'lumber', x: 80, y: 240 }, { id: 'mine', x: 230, y: 240 },
      { id: 'market', x: 80, y: 360 }, { id: 'quarry', x: 230, y: 360 },
      { id: 'barracks', x: 80, y: 480 }, { id: 'embassy', x: 230, y: 480 },
    ];
    expect(visibleVillageLabels(labels, mobile, 'embassy')).toEqual(['embassy', 'hall', 'farm']);
    expect(visibleVillageLabels(labels, { ...mobile, zoom: 1.8 }, 'embassy')).toHaveLength(5);
    expect(visibleVillageLabels(labels, { ...mobile, zoom: 2.8 }, 'embassy')).toHaveLength(8);
    expect(visibleVillageLabels(labels, camera, null)).toHaveLength(8);
  });
  it('keeps label density stable during pinch jitter around zoom thresholds', () => {
    expect(getVillageLabelDensity(1.55, 'overview')).toBe('overview');
    expect(getVillageLabelDensity(1.61, 'overview')).toBe('village');
    expect(getVillageLabelDensity(1.45, 'village')).toBe('village');
    expect(getVillageLabelDensity(1.39, 'village')).toBe('overview');
    expect(getVillageLabelDensity(2.45, 'village')).toBe('village');
    expect(getVillageLabelDensity(2.51, 'village')).toBe('detail');
    expect(getVillageLabelDensity(2.35, 'detail')).toBe('detail');
    expect(getVillageLabelDensity(2.29, 'detail')).toBe('village');
    expect(getVillageLabelDensity(2.8, 'overview')).toBe('detail');
    expect(getVillageLabelDensity(1, 'detail')).toBe('overview');
  });
});

import { describe, expect, it } from 'vitest';
import {
  createCamera,
  focusCamera,
  panCamera,
  projectPoint,
  unprojectPoint,
  resizeCamera,
  zoomCamera,
} from './cameraMath';
import { buildingPlots, rectCenter } from './coordinates';

describe('village world camera', () => {
  it('contains the complete original artwork on a narrow screen without stretching', () => {
    const camera = createCamera({ width: 384, height: 400 });
    expect(projectPoint({ x: 0, y: 0 }, camera)).toEqual({ x: 0, y: 72 });
    expect(projectPoint({ x: 1536, y: 1024 }, camera)).toEqual({ x: 384, y: 328 });
    expect(unprojectPoint({ x: 192, y: 200 }, camera)).toEqual({ x: 768, y: 512 });
  });
  it('keeps the world point beneath a pinch centroid in place and clamps extreme gestures', () => {
    const overview = createCamera({ width: 768, height: 512 });
    const zoomed = zoomCamera(overview, 2, { x: 480, y: 300 });
    expect(zoomed.zoom).toBe(2);
    expect(projectPoint(unprojectPoint({ x: 480, y: 300 }, overview), zoomed)).toEqual({
      x: 480,
      y: 300,
    });
    expect(zoomCamera(zoomed, 100).zoom).toBe(3.5);
    expect(zoomCamera(zoomed, 0.001).zoom).toBe(1);
    const panned = panCamera(zoomed, 100000, -100000);
    expect(projectPoint({ x: 0, y: 0 }, panned).x).toBe(0);
    expect(projectPoint({ x: 1536, y: 1024 }, panned).y).toBe(512);
  });
  it('refits the whole village on resize instead of keeping a previous zoom', () => {
    const focused = focusCamera(createCamera({ width: 768, height: 512 }), {
      x: 600,
      y: 400,
      width: 200,
      height: 200,
    });
    expect(focused.zoom).toBeGreaterThan(1);
    const resized = resizeCamera(focused, { width: 1536, height: 1024 });
    expect(resized.zoom).toBe(1);
    expect(resized.x).toBe(768);
    expect(resized.y).toBe(512);
    expect(projectPoint({ x: 0, y: 0 }, resized)).toEqual({ x: 0, y: 0 });
    expect(projectPoint({ x: 1536, y: 1024 }, resized)).toEqual({ x: 1536, y: 1024 });
  });
  it('positions a mobile selection above the bottom sheet without changing desktop focus', () => {
    const camera = createCamera({ width: 384, height: 400 });
    const anchor = { x: 192, y: 112 };
    for (const building of ['hall', 'farm'] as const) {
      const rect = buildingPlots[building];
      const focused = focusCamera(camera, rect, anchor);
      expect(projectPoint(rectCenter(rect), focused).y).toBeCloseTo(112);
      expect(focused.zoom).toBe(focusCamera(camera, rect).zoom);
    }
    const hall = focusCamera(camera, buildingPlots.hall);
    expect(projectPoint(rectCenter(buildingPlots.hall), hall)).toEqual({ x: 192, y: 200 });
  });
});

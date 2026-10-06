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
  it('frames an independent portrait world and bounds extreme drags at all four edges', () => {
    const world = { width: 900, height: 1600 };
    const overview = createCamera({ width: 450, height: 800 }, false, world);
    expect(overview.world).toEqual(world);
    expect(projectPoint({ x: 0, y: 0 }, overview)).toEqual({ x: 0, y: 0 });
    expect(projectPoint(worldPoint(world), overview)).toEqual({ x: 450, y: 800 });
    const zoomed = zoomCamera(overview, 2);
    for (const [dx, dy] of [[100000, 100000], [-100000, 100000], [100000, -100000], [-100000, -100000]]) {
      const camera = panCamera(zoomed, dx, dy);
      const topLeft = projectPoint({ x: 0, y: 0 }, camera);
      const bottomRight = projectPoint(worldPoint(world), camera);
      expect(topLeft.x).toBeLessThanOrEqual(0);
      expect(topLeft.y).toBeLessThanOrEqual(0);
      expect(bottomRight.x).toBeGreaterThanOrEqual(450);
      expect(bottomRight.y).toBeGreaterThanOrEqual(800);
    }
  });
  it('fills a portrait viewport on entry while retaining a full-city overview', () => {
    const viewport = { width: 390, height: 526 };
    const camera = createCamera(viewport, true);
    expect(projectPoint({ x: 800, y: 0 }, camera).y).toBeCloseTo(0);
    expect(projectPoint({ x: 800, y: 900 }, camera).y).toBeCloseTo(526);
    expect(camera.zoom).toBeGreaterThan(2);
    expect(createCamera(viewport).zoom).toBe(1);
  });
  it('contains the complete 16:9 master artwork on a narrow screen without stretching', () => {
    const camera = createCamera({ width: 384, height: 400 });
    expect(projectPoint({ x: 0, y: 0 }, camera)).toEqual({ x: 0, y: 92 });
    expect(projectPoint({ x: 1600, y: 900 }, camera)).toEqual({ x: 384, y: 308 });
    expect(unprojectPoint({ x: 192, y: 200 }, camera)).toEqual({ x: 800, y: 450 });
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
    expect(projectPoint({ x: 1600, y: 900 }, panned).y).toBeCloseTo(512);
  });
  it('focuses real artwork coordinates and preserves the world position after resize', () => {
    const focused = focusCamera(createCamera({ width: 768, height: 512 }), {
      x: 600,
      y: 400,
      width: 200,
      height: 200,
    });
    expect(focused.zoom).toBe(3.5);
    expect(projectPoint({ x: 700, y: 500 }, focused)).toEqual({ x: 384, y: 256 });
    const resized = resizeCamera(focused, { width: 1536, height: 1024 });
    expect(resized.x).toBe(700);
    expect(resized.y).toBe(500);
    expect(resized.zoom).toBe(focused.zoom);
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
    const projected = projectPoint(rectCenter(buildingPlots.hall), hall);
    expect(projected.x).toBeCloseTo(192);
    expect(projected.y).toBeCloseTo(137.320851);
    // The palace is near the top edge: focusing it must not expose space outside the art.
    expect(projectPoint({ x: 0, y: 0 }, hall).y).toBeCloseTo(0);
  });
});

function worldPoint(world: { width: number; height: number }) {
  return { x: world.width, y: world.height };
}

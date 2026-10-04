import { afterEach, describe, expect, it, vi } from 'vitest';
import { projectPoint } from '@/lib/kingdoms/village/cameraMath';
import { VillageCamera } from './village-camera';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fixed village camera', () => {
  it('keeps the fitted frame when a building is selected', () => {
    const camera = new VillageCamera({ width: 768, height: 512 });
    const origin = camera.getSnapshot();
    const complete = vi.fn();
    camera.focusOn('stable', complete);
    expect(complete).toHaveBeenCalledOnce();
    expect(camera.getSnapshot()).toEqual(origin);
    expect(projectPoint({ x: 0, y: 0 }, camera.getSnapshot()).x).toBe(0);
    camera.zoomBy(2);
    camera.panBy(80, 40);
    expect(camera.getSnapshot().zoom).toBe(1);
    camera.destroy();
  });

  it('refits the whole village when the viewport changes', () => {
    const camera = new VillageCamera({ width: 768, height: 512 });
    camera.resize({ width: 1920, height: 1080 });
    const fitted = camera.getSnapshot();
    expect(fitted.zoom).toBe(1);
    expect(fitted.x).toBe(768);
    expect(fitted.y).toBe(512);
    const top = projectPoint({ x: 0, y: 0 }, fitted);
    const bottom = projectPoint({ x: 1536, y: 1024 }, fitted);
    expect(top.y).toBe(0);
    expect(bottom.y).toBe(1080);
    expect(top.x).toBeGreaterThanOrEqual(0);
    expect(bottom.x).toBeLessThanOrEqual(1920);
    camera.destroy();
  });
});

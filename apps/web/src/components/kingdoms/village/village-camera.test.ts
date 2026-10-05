import { afterEach, describe, expect, it, vi } from 'vitest';
import { projectPoint } from '@/lib/kingdoms/village/cameraMath';
import { VillageCamera } from './village-camera';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function animationClock() {
  const origin = 10000;
  let now = origin;
  let nextFrame = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  return (elapsed: number) => {
    now = origin + elapsed;
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback(elapsed));
  };
}

describe('stable camera navigation', () => {
  it('animates absolute presets, completes once, and clamps invalid zoom values', () => {
    const advance = animationClock();
    const camera = new VillageCamera({ width: 768, height: 512 });
    const complete = vi.fn();
    camera.zoomTo(2.8, complete);
    advance(325);
    expect(camera.getSnapshot().zoom).toBeGreaterThan(1);
    expect(camera.getSnapshot().zoom).toBeLessThan(2.8);
    advance(650);
    expect(camera.getSnapshot().zoom).toBeCloseTo(2.8);
    expect(complete).toHaveBeenCalledOnce();
    camera.reducedMotion = true;
    camera.zoomTo(100);
    expect(camera.getSnapshot().zoom).toBe(3.5);
    camera.zoomTo(-1);
    expect(camera.getSnapshot().zoom).toBe(1);
    camera.zoomTo(NaN);
    expect(camera.getSnapshot().zoom).toBe(1);
    camera.destroy();
  });
  it('retains the selected preset through a later portrait layout measurement', () => {
    const camera = new VillageCamera({ width: 768, height: 512 }, true);
    camera.reducedMotion = true;
    camera.zoomTo(1.8);
    camera.resize({ width: 390, height: 600 });
    expect(camera.getSnapshot().zoom).toBe(1.8);
    camera.destroy();
  });
  it('uses the current portrait policy when resetting after a desktop to mobile resize', () => {
    let portrait = false;
    const camera = new VillageCamera({ width: 1920, height: 1000 }, () => portrait);
    camera.reducedMotion = true;
    camera.focusOn('stable');
    camera.resize({ width: 390, height: 600 });
    camera.reset();
    expect(camera.getSnapshot().zoom).toBe(1);
    portrait = true;
    camera.reset();
    expect(projectPoint({ x: 800, y: 0 }, camera.getSnapshot()).y).toBeCloseTo(0);
    expect(projectPoint({ x: 800, y: 900 }, camera.getSnapshot()).y).toBeCloseTo(600);
    camera.destroy();
  });

  it('restores a portrait cover after zoom and pan when resetting the mobile city', () => {
    const camera = new VillageCamera({ width: 390, height: 600 }, true);
    camera.reducedMotion = true;
    camera.zoomAt(1.1, { x: 195, y: 300 });
    camera.panBy(-100, 20);
    camera.reset();
    expect(projectPoint({ x: 800, y: 0 }, camera.getSnapshot()).y).toBeCloseTo(0);
    expect(projectPoint({ x: 800, y: 900 }, camera.getSnapshot()).y).toBeCloseTo(600);
    camera.destroy();
  });

  it('fills a deferred mobile viewport measurement without overriding later player navigation', () => {
    const camera = new VillageCamera({ width: 768, height: 512 }, true);
    camera.resize({ width: 390, height: 600 });
    expect(projectPoint({ x: 800, y: 0 }, camera.getSnapshot()).y).toBeCloseTo(0);
    camera.zoomAt(.8, { x: 195, y: 300 });
    const navigated = camera.getSnapshot();
    camera.resize({ width: 390, height: 590 });
    expect(camera.getSnapshot().zoom).toBe(navigated.zoom);
    camera.destroy();
  });

  it('completes focus after 650ms when frame timestamps use a different clock origin', () => {
    const advance = animationClock();
    const camera = new VillageCamera({ width: 768, height: 512 });
    const origin = camera.getSnapshot();
    const complete = vi.fn();
    camera.focusOn('stable', complete);

    advance(325);
    expect(camera.getSnapshot().x).not.toBe(origin.x);
    expect(complete).not.toHaveBeenCalled();
    advance(650);
    const projected = projectPoint({ x: 1240, y: 544.5 }, camera.getSnapshot());
    expect(projected.x).toBeCloseTo(384);
    expect(projected.y).toBeCloseTo(256);
    expect(complete).toHaveBeenCalledOnce();
    advance(700);
    expect(complete).toHaveBeenCalledOnce();
    camera.destroy();
  });

  it('preserves a pending building selection through asynchronous viewport resize', () => {
    const advance = animationClock();
    const camera = new VillageCamera({ width: 768, height: 512 });
    const complete = vi.fn();
    camera.focusOn('stable', complete);
    advance(200);
    camera.resize({ width: 390, height: 410 });
    advance(849);
    expect(complete).not.toHaveBeenCalled();
    advance(850);
    expect(complete).toHaveBeenCalledOnce();
    expect(camera.getSnapshot().viewport).toEqual({ width: 390, height: 410 });
    advance(1000);
    expect(complete).toHaveBeenCalledOnce();
    camera.destroy();
  });

  it('reports a pending replacement selection so layout does not refocus the old panel', () => {
    const advance = animationClock();
    const camera = new VillageCamera({ width: 768, height: 512 });
    camera.reducedMotion = true;
    camera.focusOn('stable');
    camera.reducedMotion = false;
    const complete = vi.fn();
    camera.focusOn('lumber', complete);
    advance(200);
    const resumed = camera.resize({ width: 390, height: 410 });
    if (!resumed) camera.focusOn('stable');
    advance(850);
    expect(complete).toHaveBeenCalledOnce();
    camera.destroy();
  });

  it('ignores unchanged layout notifications during an active focus animation', () => {
    const advance = animationClock();
    const camera = new VillageCamera({ width: 768, height: 512 });
    const complete = vi.fn();
    camera.focusOn('stable', complete);
    advance(200);
    camera.resize({ width: 768, height: 512 });
    advance(650);
    expect(complete).toHaveBeenCalledOnce();
    camera.destroy();
  });

  it.each(['pan', 'destroy'] as const)('cancels pending focus completion on %s', (action) => {
    const advance = animationClock();
    const camera = new VillageCamera({ width: 768, height: 512 });
    const complete = vi.fn();
    camera.focusOn('stable', complete);
    advance(325);
    if (action === 'pan') camera.panBy(20, 0);
    else camera.destroy();
    const interrupted = camera.getSnapshot();
    advance(700);
    expect(camera.getSnapshot()).toBe(interrupted);
    expect(complete).not.toHaveBeenCalled();
    camera.destroy();
  });

  it('focuses the stable itself and completes selection without moving to the barracks', () => {
    const camera = new VillageCamera({ width: 768, height: 512 });
    camera.reducedMotion = true;
    const complete = vi.fn();
    camera.focusOn('stable', complete);
    const projected = projectPoint({ x: 1240, y: 544.5 }, camera.getSnapshot());
    expect(projected.x).toBeCloseTo(384);
    expect(projected.y).toBeCloseTo(256);
    expect(complete).toHaveBeenCalledOnce();
    camera.destroy();
  });

  it('honors the lower world edge when the mobile focus anchor cannot be reached', () => {
    const camera = new VillageCamera({ width: 390, height: 410 });
    camera.reducedMotion = true;
    camera.getFocusAnchor = () => ({ x: 195, y: 138.64 });
    camera.focusOn('stable');
    const projected = projectPoint({ x: 1240, y: 544.5 }, camera.getSnapshot());
    expect(projected.x).toBeCloseTo(195);
    expect(projected.y).toBeCloseTo(202.0325);
    expect(projectPoint({ x: 1600, y: 900 }, camera.getSnapshot()).y).toBeCloseTo(410);
    camera.destroy();
  });

  it('uses development calibration for focus position and scale', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const camera = new VillageCamera({ width: 768, height: 512 });
    camera.reducedMotion = true;
    camera.debug = {
      placementOverrides: { stable: { focusX: 530, focusY: 570, focusScale: 2.2, zIndex: 600 } },
    };
    camera.focusOn('stable');
    expect(camera.getSnapshot().x).toBeCloseTo(530);
    expect(camera.getSnapshot().y).toBeCloseTo(570);
    expect(camera.getSnapshot().zoom).toBeCloseTo(2.2);
    camera.destroy();
  });

  it('ignores development calibration in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const camera = new VillageCamera({ width: 768, height: 512 });
    camera.reducedMotion = true;
    camera.debug = {
      rectOverrides: { stable: { x: 900, y: 650, width: 100, height: 70 } },
      placementOverrides: { stable: { focusX: 950, focusY: 680, focusScale: 2.2, zIndex: 700 } },
    };
    camera.focusOn('stable');
    expect(camera.getSnapshot().x).toBeCloseTo(1240);
    expect(camera.getSnapshot().y).toBeCloseTo(544.5);
    camera.destroy();
  });
});

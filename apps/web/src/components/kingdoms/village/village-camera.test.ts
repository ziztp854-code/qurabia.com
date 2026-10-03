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
    const projected = projectPoint({ x: 509.5, y: 549.5 }, camera.getSnapshot());
    expect(projected.x).toBeCloseTo(384);
    expect(projected.y).toBeCloseTo(256);
    expect(complete).toHaveBeenCalledOnce();
    advance(700);
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
    const projected = projectPoint({ x: 509.5, y: 549.5 }, camera.getSnapshot());
    expect(projected.x).toBeCloseTo(384);
    expect(projected.y).toBeCloseTo(256);
    expect(complete).toHaveBeenCalledOnce();
    camera.destroy();
  });

  it('keeps the stable above the sheet using the existing mobile focus anchor', () => {
    const camera = new VillageCamera({ width: 390, height: 410 });
    camera.reducedMotion = true;
    camera.getFocusAnchor = () => ({ x: 195, y: 138.64 });
    camera.focusOn('stable');
    const projected = projectPoint({ x: 509.5, y: 549.5 }, camera.getSnapshot());
    expect(projected.x).toBeCloseTo(195);
    expect(projected.y).toBeCloseTo(138.64);
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
    expect(camera.getSnapshot().x).toBeCloseTo(509.5);
    expect(camera.getSnapshot().y).toBeCloseTo(549.5);
    camera.destroy();
  });
});

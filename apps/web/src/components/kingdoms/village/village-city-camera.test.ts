import { afterEach, describe, expect, it, vi } from 'vitest';
import { VillageCamera } from './village-camera';
import { getCityCameraProfile } from '@/lib/kingdoms/village/city-camera-profile';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function animationClock() {
  let elapsed = 0;
  let nextFrame = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  return (time: number) => {
    elapsed = time;
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback(time));
  };
}

describe('city scene camera navigation', () => {
  it('keeps a facility entrance through unchanged layout notifications with equivalent world dimensions', () => {
    const advance = animationClock();
    const world = { width: 1600, height: 900 };
    const camera = new VillageCamera({ width: 1280, height: 720 }, false, world);
    const complete = vi.fn();
    camera.focusForScene('barracks', complete);
    advance(90);
    camera.resize({ width: 1280, height: 720 }, world);
    advance(179);
    expect(complete).not.toHaveBeenCalled();
    advance(180);
    expect(complete).toHaveBeenCalledOnce();
    expect(camera.getSnapshot().state).toBe('BUILDING_SCENE');
    advance(500);
    expect(complete).toHaveBeenCalledOnce();
    camera.destroy();
  });

  it('resumes the fast facility entrance after orientation change with its original zoom and a single completion', () => {
    const advance = animationClock();
    const camera = new VillageCamera({ width: 1280, height: 720 }, false, { width: 1600, height: 900 });
    const complete = vi.fn();
    camera.focusForScene('barracks', complete);
    advance(60);
    const resumed = camera.resize({ width: 390, height: 844 }, { width: 900, height: 1600 });
    expect(resumed).toBe(true);
    advance(239);
    expect(complete).not.toHaveBeenCalled();
    expect(camera.getSnapshot().state).toBe('BUILDING_FOCUS');
    advance(240);
    expect(complete).toHaveBeenCalledOnce();
    expect(camera.getSnapshot()).toMatchObject({
      state: 'BUILDING_SCENE',
      zoom: 1.6,
      viewport: { width: 390, height: 844 },
      world: { width: 900, height: 1600 },
    });
    camera.resize({ width: 390, height: 844 }, { width: 900, height: 1600 });
    advance(900);
    expect(complete).toHaveBeenCalledOnce();
    camera.destroy();
  });

  it('returns the saved normalized city position after changing between independent landscape and portrait profiles', () => {
    const desktop = getCityCameraProfile({ width: 1600, height: 900 });
    const portrait = getCityCameraProfile({ width: 900, height: 1600 });
    const camera = new VillageCamera({ width: 1600, height: 900 }, false, desktop.world);
    camera.reducedMotion = true;
    camera.zoomAt(2, { x: 800, y: 450 });
    camera.panBy(-100, -60);
    const saved = camera.getSnapshot();
    expect(saved).toMatchObject({ x: 850, y: 480 });
    camera.focusForScene('hall');
    camera.resize({ width: 900, height: 1600 }, portrait.world);
    camera.restore(saved);
    expect(camera.getSnapshot()).toMatchObject({ x: 478.125, zoom: 2, state: 'CITY_EXPLORE', world: portrait.world });
    expect(camera.getSnapshot().y).toBeCloseTo(853.3333333333);
    camera.resize({ width: 1600, height: 900 }, desktop.world);
    camera.restore(saved);
    expect(camera.getSnapshot()).toEqual(saved);
    camera.destroy();
  });

  it('ignores a browser frame that was already queued when a focus is interrupted by dragging', () => {
    let elapsed = 0;
    let queued: FrameRequestCallback | undefined;
    vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { queued = callback; return 1; });
    // A queued browser callback may already be in flight when cancellation occurs.
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const camera = new VillageCamera({ width: 450, height: 800 }, false, { width: 900, height: 1600 });
    camera.reducedMotion = true;
    camera.zoomAt(2, { x: 225, y: 400 });
    camera.reducedMotion = false;
    const complete = vi.fn();
    camera.focusForScene('hall', complete);
    camera.panBy(50, 0);
    const interrupted = camera.getSnapshot();
    elapsed = 200;
    queued?.(elapsed);
    expect(camera.getSnapshot()).toBe(interrupted);
    expect(interrupted.state).toBe('CITY_EXPLORE');
    expect(complete).not.toHaveBeenCalled();
    camera.destroy();
  });
  it('publishes overview, explore, building focus and scene states while preserving the portrait camera on return', () => {
    let elapsed = 0;
    let frame: FrameRequestCallback | undefined;
    vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => { frame = undefined; });
    const camera = new VillageCamera({ width: 450, height: 800 }, false, { width: 900, height: 1600 });
    expect(camera.getSnapshot().state).toBe('CITY_OVERVIEW');
    camera.zoomAt(2, { x: 225, y: 400 });
    camera.panBy(-50, 90);
    const prior = camera.getSnapshot();
    expect(prior.state).toBe('CITY_EXPLORE');
    camera.getPlacement = () => ({ x: 300, y: 400, width: 180, height: 200, focusX: 390, focusY: 500, focusScale: 2, zIndex: 1 });
    camera.focusForScene('hall');
    expect(camera.getSnapshot().state).toBe('BUILDING_FOCUS');
    elapsed = 180;
    frame?.(elapsed);
    expect(camera.getSnapshot().state).toBe('BUILDING_SCENE');
    camera.resize({ width: 390, height: 690 });
    camera.restore(prior);
    expect(camera.getSnapshot()).toMatchObject({ x: prior.x, y: prior.y, zoom: 2, state: 'CITY_EXPLORE', world: { width: 900, height: 1600 }, viewport: { width: 390, height: 690 } });
    camera.destroy();
  });
  it('restores the overview camera after interrupting a fast facility entrance', () => {
    let elapsed = 0;
    let frame: FrameRequestCallback | undefined;
    vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => { frame = undefined; });
    const camera = new VillageCamera({ width: 1440, height: 900 });
    camera.reducedMotion = true;
    camera.zoomTo(1.8);
    camera.panBy(80, 30);
    const overview = camera.getSnapshot();
    camera.reducedMotion = false;
    const complete = vi.fn();
    camera.focusForScene('hall', complete);
    elapsed = 90;
    frame?.(elapsed);
    expect(camera.getSnapshot().x).not.toBe(overview.x);
    camera.restore(overview);
    elapsed = 300;
    frame?.(elapsed);
    expect(camera.getSnapshot()).toEqual(overview);
    expect(complete).not.toHaveBeenCalled();
    camera.destroy();
  });

  it('finishes facility focus in 180ms and retains the current viewport when returning after resize', () => {
    let elapsed = 0;
    let frame: FrameRequestCallback | undefined;
    vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => { frame = undefined; });
    const camera = new VillageCamera({ width: 1280, height: 720 });
    const overview = camera.getSnapshot();
    const complete = vi.fn();
    camera.focusForScene('barracks', complete);
    elapsed = 180;
    frame?.(elapsed);
    expect(complete).toHaveBeenCalledOnce();
    camera.resize({ width: 390, height: 844 });
    camera.restore(overview);
    expect(camera.getSnapshot()).toMatchObject({ x: 800, y: 450, zoom: 1, viewport: { width: 390, height: 844 } });
    camera.destroy();
  });
});

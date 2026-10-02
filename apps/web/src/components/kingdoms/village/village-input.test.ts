import { describe, expect, it, vi } from 'vitest';
import { VillageCamera } from './village-camera';
import { bindVillageInput } from './village-input';

const pointer = (type: string, id: number, x: number, y: number, kind = 'touch') => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: id },
    clientX: { value: x },
    clientY: { value: y },
    pointerType: { value: kind },
    button: { value: 0 },
  });
  return event;
};

describe('village gesture controls', () => {
  it('zooms with two fingers, suppresses the synthetic click and releases all listeners', () => {
    const element = document.createElement('div');
    const camera = new VillageCamera({ width: 768, height: 512 });
    const cleanup = bindVillageInput(element, camera);
    element.dispatchEvent(pointer('pointerdown', 1, 250, 200));
    element.dispatchEvent(pointer('pointerdown', 2, 450, 200));
    element.dispatchEvent(pointer('pointermove', 2, 550, 200));
    expect(camera.getSnapshot().zoom).toBeCloseTo(1.5);
    const select = vi.fn();
    element.addEventListener('click', select);
    element.dispatchEvent(pointer('pointerup', 1, 250, 200));
    element.dispatchEvent(pointer('pointerup', 2, 550, 200));
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(select).not.toHaveBeenCalled();
    cleanup();
    const before = camera.getSnapshot();
    element.dispatchEvent(
      new WheelEvent('wheel', { deltaY: -100, clientX: 384, clientY: 256, cancelable: true }),
    );
    expect(camera.getSnapshot()).toBe(before);
    expect(element.dataset.dragging).toBeUndefined();
    camera.destroy();
  });

  it('supports drag, wheel, double click and immediate reduced-motion keyboard reset', () => {
    const element = document.createElement('div');
    const camera = new VillageCamera({ width: 768, height: 512 });
    camera.reducedMotion = true;
    const cleanup = bindVillageInput(element, camera);
    element.dispatchEvent(
      new WheelEvent('wheel', { deltaY: -200, clientX: 384, clientY: 256, cancelable: true }),
    );
    expect(camera.getSnapshot().zoom).toBeGreaterThan(1);
    element.dispatchEvent(
      new MouseEvent('dblclick', { clientX: 384, clientY: 256, cancelable: true }),
    );
    expect(camera.getSnapshot().zoom).toBeGreaterThan(2);
    element.dispatchEvent(pointer('pointerdown', 1, 400, 250, 'mouse'));
    element.dispatchEvent(pointer('pointermove', 1, 450, 250, 'mouse'));
    element.dispatchEvent(pointer('pointerup', 1, 450, 250, 'mouse'));
    expect(camera.getSnapshot().x).toBeLessThan(768);
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', cancelable: true }));
    expect(camera.getSnapshot().zoom).toBe(1);
    cleanup();
    camera.destroy();
  });

  it('opens a building only after the focus completes and cancels obsolete focus callbacks', () => {
    vi.useFakeTimers();
    const camera = new VillageCamera({ width: 768, height: 512 });
    const farm = vi.fn();
    const hall = vi.fn();
    camera.focusOn('farm', farm);
    expect(farm).not.toHaveBeenCalled();
    camera.focusOn('hall', hall);
    vi.advanceTimersByTime(700);
    expect(farm).not.toHaveBeenCalled();
    expect(hall).toHaveBeenCalledOnce();
    camera.destroy();
    vi.useRealTimers();
  });
});

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

describe('fixed village input', () => {
  it('ignores pinch, wheel, drag, double-click and keyboard zoom', () => {
    const element = document.createElement('div');
    const camera = new VillageCamera({ width: 768, height: 512 });
    const before = camera.getSnapshot();
    const cleanup = bindVillageInput(element, camera);
    element.dispatchEvent(pointer('pointerdown', 1, 250, 200));
    element.dispatchEvent(pointer('pointerdown', 2, 450, 200));
    element.dispatchEvent(pointer('pointermove', 2, 550, 200));
    element.dispatchEvent(pointer('pointerup', 1, 250, 200));
    element.dispatchEvent(pointer('pointerup', 2, 550, 200));
    element.dispatchEvent(pointer('pointerdown', 1, 400, 250, 'mouse'));
    element.dispatchEvent(pointer('pointermove', 1, 450, 250, 'mouse'));
    element.dispatchEvent(pointer('pointerup', 1, 450, 250, 'mouse'));
    element.dispatchEvent(
      new WheelEvent('wheel', { deltaY: -200, clientX: 384, clientY: 256, cancelable: true }),
    );
    element.dispatchEvent(new MouseEvent('dblclick', { clientX: 384, clientY: 256, cancelable: true }));
    element.dispatchEvent(new KeyboardEvent('keydown', { key: '+', cancelable: true }));
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true }));
    expect(camera.getSnapshot()).toEqual(before);
    const select = vi.fn();
    element.addEventListener('click', select);
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(select).toHaveBeenCalledOnce();
    cleanup();
    camera.destroy();
  });

  it('selects immediately without moving the fitted camera', () => {
    const camera = new VillageCamera({ width: 768, height: 512 });
    const before = camera.getSnapshot();
    const complete = vi.fn();
    camera.focusOn('hall', complete);
    camera.zoomBy(2);
    camera.panBy(40, 20);
    expect(complete).toHaveBeenCalledOnce();
    expect(camera.getSnapshot()).toEqual(before);
    camera.destroy();
  });
});

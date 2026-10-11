import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import { FarmSceneContext } from './farm-scene-context';
import { SultanFarmScene } from './sultan-farm-scene';
const runtime = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  resize: vi.fn(),
  setMotion: vi.fn(),
  destroy: vi.fn(),
}));
vi.mock('./sultan-farm-renderer', () => ({ createSultanFarmRenderer: runtime.create }));
const now = 1800000000000;
const world = executeCommand(
  createWorld(now),
  'farmer',
  { type: 'found', name: 'قرية الاختبار' },
  now,
);
const view = {
  ...projectWorld(world, 'farmer', now),
  worldId: 'farm-world',
  worldName: 'اختبار',
  paused: false,
  revision: 0,
};
const props = {
  view,
  village: view.villages[0],
  busy: false,
  send: vi.fn().mockResolvedValue(undefined),
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('ResizeObserver', undefined);
  runtime.create.mockResolvedValue(runtime);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('farm scene lifecycle', () => {
  it('opens and cleans up without ResizeObserver, retaining usable camera controls', async () => {
    const rendered = render(
      <SultanFarmScene {...props}>
        <picture>
          <img alt="" />
        </picture>
      </SultanFarmScene>,
    );
    await waitFor(() =>
      expect(rendered.container.querySelector('[data-pixi-farm]')).toHaveAttribute(
        'data-pixi-farm',
        'true',
      ),
    );
    fireEvent(window, new Event('resize'));
    expect(runtime.resize).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'المزرعة كاملة' })).toBeEnabled();
    rendered.unmount();
    expect(runtime.destroy).toHaveBeenCalledOnce();
  });
  it('reports renderer failure without removing the photograph or controls', async () => {
    runtime.create.mockRejectedValueOnce(new Error('unavailable renderer'));
    const rendered = render(
      <SultanFarmScene {...props}>
        <picture>
          <img alt="" />
        </picture>
      </SultanFarmScene>,
    );
    expect(await screen.findByRole('status')).toHaveTextContent('تعذر رسم النباتات');
    expect(rendered.container.querySelector('picture')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'المزرعة كاملة' })).toBeEnabled();
  });

  it('selects the rear hit extension without refocusing the camera', () => {
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1024);
    const height = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(572);
    const select = vi.fn();
    render(
      <FarmSceneContext.Provider
        value={{
          motionPaused: false,
          setMotionPaused: vi.fn(),
          selected: 0,
          select,
          registerFocus: vi.fn(() => vi.fn()),
        }}
      >
        <SultanFarmScene {...props}>
          <picture>
            <img alt="" />
          </picture>
        </SultanFarmScene>
      </FarmSceneContext.Provider>,
    );
    const viewport = screen.getByRole('application');
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0 } as DOMRect);
    Object.defineProperties(viewport, {
      setPointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: vi.fn(() => true) },
      releasePointerCapture: { configurable: true, value: vi.fn() },
    });

    viewport.dispatchEvent(pointer('pointerdown', 7, 454.75, 97.25));
    viewport.dispatchEvent(pointer('pointerup', 7, 454.75, 97.25));

    expect(select).toHaveBeenCalledWith(0, { focus: false });
    width.mockRestore();
    height.mockRestore();
  });

  it('never turns a two-finger gesture, drag or cancellation into a bed selection', () => {
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1024);
    const height = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(572);
    const select = vi.fn();
    render(
      <FarmSceneContext.Provider
        value={{
          motionPaused: false,
          setMotionPaused: vi.fn(),
          selected: 0,
          select,
          registerFocus: vi.fn(() => vi.fn()),
        }}
      >
        <SultanFarmScene {...props}><picture><img alt="" /></picture></SultanFarmScene>
      </FarmSceneContext.Provider>,
    );
    const viewport = screen.getByRole('application');
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0 } as DOMRect);
    Object.defineProperties(viewport, {
      setPointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: vi.fn(() => true) },
      releasePointerCapture: { configurable: true, value: vi.fn() },
    });

    viewport.dispatchEvent(pointer('pointerdown', 1, 454.75, 127.25));
    viewport.dispatchEvent(pointer('pointerdown', 2, 554.75, 127.25));
    viewport.dispatchEvent(pointer('pointerup', 1, 454.75, 127.25));
    viewport.dispatchEvent(pointer('pointerup', 2, 554.75, 127.25));
    viewport.dispatchEvent(pointer('pointerdown', 3, 454.75, 127.25));
    viewport.dispatchEvent(pointer('pointermove', 3, 480, 150));
    viewport.dispatchEvent(pointer('pointerup', 3, 480, 150));
    viewport.dispatchEvent(pointer('pointerdown', 4, 454.75, 127.25));
    viewport.dispatchEvent(pointer('pointercancel', 4, 454.75, 127.25));

    expect(select).not.toHaveBeenCalled();
    width.mockRestore();
    height.mockRestore();
  });
});

function pointer(type: string, pointerId: number, clientX: number, clientY: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    clientX: { value: clientX },
    clientY: { value: clientY },
    pointerType: { value: 'touch' },
    button: { value: 0 },
  });
  return event;
}

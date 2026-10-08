import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
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
});

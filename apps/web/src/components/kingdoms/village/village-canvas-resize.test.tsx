import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import { projectPoint } from '@/lib/kingdoms/village/cameraMath';
import { VILLAGE_WORLD } from '@/lib/kingdoms/village/coordinates';
import type { VillageSceneHandle } from '@/lib/kingdoms/village/types';
import { VillageCanvas } from './village-canvas';

vi.mock('./village-renderer', () => ({
  createVillageRenderer: vi.fn().mockRejectedValue(new Error('GPU unavailable on this device')),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('selected village building on viewport resize', () => {
  it('refits the whole village without moving the camera onto the selection', async () => {
    const now = 1800000000000;
    const view = projectWorld(
      executeCommand(createWorld(now), 'p', { type: 'found', name: 'اختبار' }, now),
      'p',
      now,
    );
    const onSelect = vi.fn();
    const ref = createRef<VillageSceneHandle>();
    await act(async () => {
      render(
        <VillageCanvas
          ref={ref}
          view={view}
          village={view.villages[0]}
          selected="hall"
          onSelect={onSelect}
          quality="auto"
          reducedMotion
          showLabels={false}
        />,
      );
    });
    const stage = screen.getByRole('region', { name: /مشهد القرية الثابت/ });
    const scrollIntoView = vi.fn();
    Object.defineProperty(stage, 'scrollIntoView', { value: scrollIntoView, configurable: true });
    Object.defineProperties(stage, {
      clientWidth: { value: 390, configurable: true },
      clientHeight: { value: 260, configurable: true },
    });
    await act(async () => {
      window.dispatchEvent(new Event('resize'));
    });
    const camera = ref.current!.getSnapshot();
    expect(camera.zoom).toBe(1);
    const origin = projectPoint({ x: 0, y: 0 }, camera);
    const far = projectPoint({ x: VILLAGE_WORLD.width, y: VILLAGE_WORLD.height }, camera);
    expect(origin.x).toBeGreaterThanOrEqual(-1);
    expect(origin.y).toBeGreaterThanOrEqual(-1);
    expect(far.x).toBeLessThanOrEqual(camera.viewport.width + 1);
    expect(far.y).toBeLessThanOrEqual(camera.viewport.height + 1);
    expect(onSelect).not.toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import type { VillageSceneHandle } from '@/lib/kingdoms/village/types';
import { VillageCanvas } from './village-canvas';

vi.mock('./village-renderer', () => ({
  createVillageRenderer: vi.fn().mockResolvedValue({
    camera: vi.fn(),
    update: vi.fn(),
    hover: vi.fn(),
    setVisible: vi.fn(),
    destroy: vi.fn(),
  }),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('village terrain and animated overlays', () => {
  it('keeps original terrain separate from hotspots and shares every camera projection after GPU readiness', async () => {
    const now = 1800000000000;
    const view = projectWorld(
      executeCommand(createWorld(now), 'p', { type: 'found', name: 'اختبار' }, now),
      'p',
      now,
    );
    const ref = createRef<VillageSceneHandle>();
    await act(async () => {
      render(
        <VillageCanvas
          ref={ref}
          view={view}
          village={view.villages[0]}
          selected={null}
          onSelect={vi.fn()}
          quality="medium"
          reducedMotion
          showLabels={false}
        />,
      );
    });
    const stage = screen.getByRole('region', { name: /مشهد القرية التفاعلي/ });
    await vi.waitFor(() => expect(stage.dataset.pixiReady).toBe('true'));
    const terrain = stage.querySelector('img')!.parentElement!;
    const hotspots = stage.querySelector('[data-building="hall"]')!.parentElement!.parentElement!;
    expect(terrain).not.toBe(hotspots);
    expect(terrain.parentElement).toBe(stage);
    expect(terrain.style.transform).toBe(hotspots.style.transform);
    expect(terrain.querySelector('img')!.style.visibility).not.toBe('hidden');
    await act(async () => ref.current!.zoomBy(2));
    expect(stage.dataset.zoom).toBe('2.000');
    expect(terrain.style.transform).toBe(hotspots.style.transform);
    await act(async () => ref.current!.panBy(120, 80));
    expect(terrain.style.transform).toBe(hotspots.style.transform);
    await act(async () => ref.current!.reset());
    expect(stage.dataset.zoom).toBe('1.000');
    expect(terrain.style.transform).toBe(hotspots.style.transform);
  });
});

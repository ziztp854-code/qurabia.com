import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import type { VillageSceneHandle } from '@/lib/kingdoms/village/types';
import { VillageCanvas } from './village-canvas';
import { createVillageRenderer } from './village-renderer';
import { resourceBuildingIds } from '@/lib/kingdoms/village/assetManifest';

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
  it('exposes one stable accessible building name without repeating its scene status', async () => {
    const now = 1800000000000;
    const view = projectWorld(executeCommand(createWorld(now), 'p', { type: 'found', name: 'القرية' }, now), 'p', now);
    await act(async () => {
      render(<VillageCanvas view={view} village={view.villages[0]} selected={null}
        onSelect={vi.fn()} quality="medium" reducedMotion showLabels={false} />);
    });
    expect(screen.getByRole('button', { name: 'الثكنة، لم يُبنَ' })).toHaveAccessibleDescription(/لم يُبنَ/);
  });

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
    const terrain = stage.querySelector('picture')!.parentElement!;
    const hotspots = stage.querySelector('[data-building="hall"]')!.parentElement!.parentElement!;
    expect(terrain).not.toBe(hotspots);
    expect(terrain.parentElement).toBe(stage);
    expect(terrain.style.transform).toBe(hotspots.style.transform);
    expect(terrain.querySelector('img')!.style.visibility).not.toBe('hidden');
    await act(async () => ref.current!.zoomBy(2));
    expect(stage.dataset.zoom).toBe('2.000');
    expect(terrain.style.transform).toBe(hotspots.style.transform);
    await act(async () => ref.current!.panBy(120, 80));
    expect(stage.dataset.zoom).toBe('2.000');
    expect(terrain.style.transform).toBe(hotspots.style.transform);
    await act(async () => ref.current!.reset());
    expect(stage.dataset.zoom).toBe('1.000');
    expect(terrain.style.transform).toBe(hotspots.style.transform);
  });

  it('keeps confirmed alpha resource buildings visible when GPU initialization fails', async () => {
    vi.mocked(createVillageRenderer).mockRejectedValueOnce(new Error('GPU unavailable'));
    const now = 1800000000000;
    const view = projectWorld(executeCommand(createWorld(now), 'p', { type: 'found', name: 'اختبار' }, now), 'p', now);
    const buildings = { ...view.villages[0].buildings, lumber: 3, quarry: 3, mine: 3, farm: 3, treasury: 3 };
    await act(async () => { render(<VillageCanvas view={view} village={{ ...view.villages[0], buildings }}
      selected={null} onSelect={vi.fn()} quality="high" reducedMotion showLabels />); });
    const stage = screen.getByRole('region', { name: /مشهد القرية التفاعلي/ });
    await vi.waitFor(() => expect(stage.querySelector('canvas')).toHaveAttribute('hidden'));
    expect(stage.querySelectorAll('[data-resource-art]')).toHaveLength(5);
    for (const id of resourceBuildingIds) {
      expect(stage.querySelector(`[data-resource-art="${id}"]`)).toHaveAttribute('src', `/game-art/kingdoms/village/buildings/${id}-l3-hidpi.webp`);
    }
    expect(stage.dataset.pixiReady).toBe('false');
  });

  it('removes DOM resource copies only after their GPU renderer is ready', async () => {
    const now = 1800000000000;
    const view = projectWorld(executeCommand(createWorld(now), 'p', { type: 'found', name: 'اختبار' }, now), 'p', now);
    await act(async () => { render(<VillageCanvas view={view} village={{ ...view.villages[0], buildings: { ...view.villages[0].buildings, farm: 1 } }}
      selected={null} onSelect={vi.fn()} quality="high" reducedMotion showLabels />); });
    const stage = screen.getByRole('region', { name: /مشهد القرية التفاعلي/ });
    await vi.waitFor(() => expect(stage.dataset.pixiReady).toBe('true'));
    expect(stage.querySelectorAll('[data-resource-art]')).toHaveLength(0);
  });

  it('selects the terrain plate from quality without sending the 8K master to low or medium', async () => {
    const now = 1800000000000;
    const view = projectWorld(
      executeCommand(createWorld(now), 'p', { type: 'found', name: 'اختبار' }, now),
      'p',
      now,
    );
    const renderAt = async (quality: 'low' | 'medium' | 'high' | 'ultra') => {
      cleanup();
      await act(async () => {
        render(
          <VillageCanvas
            view={view}
            village={view.villages[0]}
            selected={null}
            onSelect={vi.fn()}
            quality={quality}
            reducedMotion
            showLabels={false}
          />,
        );
      });
      return screen.getByRole('region', { name: /مشهد القرية التفاعلي/ });
    };
    const low = await renderAt('low');
    expect(low.dataset.terrainFidelity).toBe('standard');
    expect(low.dataset.terrainSrc).toBe('/game-art/kingdoms/village/mamluk-capital-960.webp');
    const medium = await renderAt('medium');
    expect(medium.dataset.terrainSrc).toBe('/game-art/kingdoms/village/mamluk-capital-960.webp');
    const high = await renderAt('high');
    expect(high.dataset.terrainFidelity).toBe('hidpi');
    expect(high.dataset.terrainSrc).toBe('/game-art/kingdoms/village/mamluk-capital-1280.webp');
    const ultra = await renderAt('ultra');
    expect(ultra.dataset.terrainFidelity).toBe('ultra');
    expect(ultra.dataset.terrainSrc).toBe('/game-art/kingdoms/village/mamluk-capital-1672.webp');
    expect(ultra.querySelector('img')?.getAttribute('src')).toContain('village/mamluk-capital-1672.webp');
  });
});

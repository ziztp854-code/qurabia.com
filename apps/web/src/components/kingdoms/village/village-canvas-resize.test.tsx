import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import { projectPoint } from '@/lib/kingdoms/village/cameraMath';
import { buildingPlots, rectCenter } from '@/lib/kingdoms/village/coordinates';
import type { VillageCanvasProps, VillageSceneHandle } from '@/lib/kingdoms/village/types';
import { VillageCanvas } from './village-canvas';

vi.mock('./village-renderer', () => ({
  createVillageRenderer: vi.fn().mockRejectedValue(new Error('GPU unavailable on this device')),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('selected village building on viewport resize', () => {
  it('reframes a selected building above the mobile sheet after desktop selection without reselecting it', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1440);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(900);
    const now = 1800000000000;
    const view = projectWorld(
      executeCommand(createWorld(now), 'p', { type: 'found', name: 'اختبار' }, now),
      'p',
      now,
    );
    const onSelect = vi.fn();
    const ref = createRef<VillageSceneHandle>();
    const props: VillageCanvasProps = {
      view,
      village: view.villages[0],
      selected: 'hall',
      onSelect,
      quality: 'auto',
      reducedMotion: true,
      showLabels: false,
    };
    await act(async () => {
      render(<VillageCanvas ref={ref} {...props} />);
    });
    const stage = screen.getByRole('region', { name: /مشهد القرية التفاعلي/ });
    const scrollIntoView = vi.fn();
    Object.defineProperty(stage, 'scrollIntoView', { value: scrollIntoView, configurable: true });
    expect(projectPoint(rectCenter(buildingPlots.hall), ref.current!.getSnapshot()).y).toBe(256);
    Object.defineProperties(stage, {
      clientWidth: { value: 390, configurable: true },
      clientHeight: { value: 410, configurable: true },
    });
    vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({
      top: 230,
      bottom: 640,
      left: 0,
      right: 390,
      x: 0,
      y: 230,
      width: 390,
      height: 410,
      toJSON: () => ({}),
    });
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(844);
    await act(async () => {
      window.dispatchEvent(new Event('resize'));
    });
    const projected = projectPoint(rectCenter(buildingPlots.hall), ref.current!.getSnapshot());
    expect(projected.y).toBeCloseTo(138.64, 1);
    expect(230 + projected.y).toBeLessThan(507);
    expect(onSelect).not.toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(stage.dataset.zoom).toBe(String(ref.current!.getSnapshot().zoom.toFixed(3)));
  });
  it.each([650, -390])(
    'brings an entirely hidden selected scene into view after mobile reflow at y=%s',
    async (initialTop) => {
      vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1440);
      vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(900);
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
      const stage = screen.getByRole('region', { name: /مشهد القرية التفاعلي/ });
      Object.defineProperties(stage, {
        clientWidth: { value: 390, configurable: true },
        clientHeight: { value: 410, configurable: true },
      });
      let top = initialTop;
      vi.spyOn(stage, 'getBoundingClientRect').mockImplementation(() => ({
        top,
        bottom: top + 410,
        left: 0,
        right: 390,
        x: 0,
        y: top,
        width: 390,
        height: 410,
        toJSON: () => ({}),
      }));
      const scrollIntoView = vi.fn(() => {
        top = 24;
      });
      Object.defineProperty(stage, 'scrollIntoView', { value: scrollIntoView, configurable: true });
      vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390);
      vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(844);
      await act(async () => {
        window.dispatchEvent(new Event('resize'));
      });
      expect(scrollIntoView).toHaveBeenCalledOnce();
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'instant' });
      const projected = projectPoint(rectCenter(buildingPlots.hall), ref.current!.getSnapshot());
      expect(top + projected.y).toBeGreaterThan(48);
      expect(top + projected.y).toBeLessThan(507);
      expect(onSelect).not.toHaveBeenCalled();
    },
  );
});

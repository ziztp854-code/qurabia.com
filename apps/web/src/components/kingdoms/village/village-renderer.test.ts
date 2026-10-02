import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import { createCamera, zoomCamera } from '@/lib/kingdoms/village/cameraMath';
import { resolveVillageQuality } from '@/lib/kingdoms/village/quality';
import type { VillageCanvasProps } from '@/lib/kingdoms/village/types';
import { createVillageRenderer } from './village-renderer';

const gpu = vi.hoisted(() => ({
  resize: vi.fn(),
  resolutionAssignment: vi.fn(),
  stage: null as import('pixi.js').Container | null,
}));
vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const source = new pixi.Texture({
    source: new pixi.TextureSource({ width: 1536, height: 1024 }),
  });
  return {
    ...pixi,
    Assets: { load: vi.fn().mockResolvedValue(source) },
    Application: class {
      stage = new pixi.Container();
      ticker = { add: vi.fn(), start: vi.fn(), stop: vi.fn(), maxFPS: 0 };
      renderer = {
        width: 768,
        height: 512,
        get resolution() {
          return 1.25;
        },
        set resolution(value: number) {
          gpu.resolutionAssignment(value);
        },
        resize: gpu.resize,
      };
      init = vi.fn(async () => {
        gpu.stage = this.stage;
      });
      render = vi.fn();
      destroy() {
        this.stage.destroy({ children: true });
      }
    },
  };
});

beforeEach(() => {
  gpu.resize.mockClear();
  gpu.resolutionAssignment.mockClear();
});

describe('village rendering surface dimensions', () => {
  it('keeps the GPU surface stable across camera frames and coordinates DPR and viewport changes', async () => {
    const now = 1800000000000;
    const view = projectWorld(
      executeCommand(createWorld(now), 'p', { type: 'found', name: 'اختبار' }, now),
      'p',
      now,
    );
    const props: VillageCanvasProps = {
      view,
      village: view.villages[0],
      selected: null,
      onSelect: vi.fn(),
      quality: 'medium',
      reducedMotion: true,
      showLabels: false,
    };
    const quality = resolveVillageQuality('medium', { width: 768, dpr: 2 });
    const renderer = await createVillageRenderer(document.createElement('canvas'), props, quality, {
      gold: 'gold',
      light: 'white',
      water: 'white',
      dust: 'gold',
    });
    // Full terrain remains in the DOM; the GPU owns only animated/detail overlay layers.
    expect(gpu.stage!.children[0].children.map((child) => child.label)).not.toContain('Sprite');
    const camera = createCamera({ width: 768, height: 512 });
    renderer.camera(camera);
    renderer.camera(zoomCamera(camera, 1.5));
    renderer.camera(zoomCamera(camera, 2));
    expect(gpu.resize).not.toHaveBeenCalled();
    renderer.update(props, resolveVillageQuality('low', { width: 768, dpr: 2 }));
    expect(gpu.resize.mock.calls).toEqual([[768, 512, 1]]);
    expect(gpu.resolutionAssignment).not.toHaveBeenCalled();
    renderer.camera(createCamera({ width: 390, height: 410 }));
    expect(gpu.resize.mock.calls).toEqual([
      [768, 512, 1],
      [390, 410, 1],
    ]);
    renderer.camera(createCamera({ width: 390, height: 410 }));
    renderer.update(props, resolveVillageQuality('low', { width: 390, dpr: 2 }));
    expect(gpu.resize).toHaveBeenCalledTimes(2);
    renderer.destroy();
  });
});

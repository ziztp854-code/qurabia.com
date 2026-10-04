import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import { createCamera, zoomCamera } from '@/lib/kingdoms/village/cameraMath';
import { resolveVillageQuality } from '@/lib/kingdoms/village/quality';
import type { VillageCanvasProps } from '@/lib/kingdoms/village/types';
import { villageAssets } from '@/lib/kingdoms/village/assetManifest';
import { createVillageRenderer } from './village-renderer';
import { Assets, Texture, TextureSource } from 'pixi.js';

vi.mock('@/lib/kingdoms/village/assetManifest', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/kingdoms/village/assetManifest')>();
  return { ...actual, villageAssets: { ...actual.villageAssets, buildings: {
    ...actual.villageAssets.buildings,
    stable: actual.villageAssets.buildings.stable.map((slot, index) => index === 2
      ? { ...slot, src: '/approved/stable-l3.webp', placeholder: false } : { ...slot, src: `/fixtures/stable-l${index + 1}.webp` }),
  } } };
});

const gpu = vi.hoisted(() => ({
  resize: vi.fn(),
  resolutionAssignment: vi.fn(),
  initCount: 0,
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
        gpu.initCount += 1;
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
  vi.clearAllMocks();
  gpu.resize.mockClear();
  gpu.resolutionAssignment.mockClear();
  gpu.initCount = 0;
});

describe('village rendering surface dimensions', () => {
  it.each([0, 1, 2, 3, 4, 5, 20])('loads only the confirmed stable tier for stable level %i', async (stable) => {
    const now = 1800000000000;
    const view = projectWorld(executeCommand(createWorld(now), 'p', { type: 'found', name: 'اختبار' }, now), 'p', now);
    const props: VillageCanvasProps = {
      view, village: { ...view.villages[0], buildings: { ...view.villages[0].buildings, stable },
        build: { building: 'stable', level: stable + 1, endsAt: now + 5000 } },
      selected: null, onSelect: vi.fn(), quality: 'low', reducedMotion: true, showLabels: false,
    };
    const quality = resolveVillageQuality('low', { width: 768, dpr: 1 });
    const renderer = await createVillageRenderer(document.createElement('canvas'), props, quality,
      { gold: 'gold', light: 'white', water: 'white', dust: 'gold' });
    const tier = Math.min(5, stable);
    const expected = tier > 0 ? [villageAssets.buildings.stable[tier - 1].src] : [];
    const assetLoad = vi.mocked(Assets.load as (src: string) => Promise<Texture>);
    const stableLoads = assetLoad.mock.calls.map(([src]) => src)
      .filter((src) => src.includes('stable-l'));
    expect(stableLoads).toEqual(expected);
    const buildingLayer = gpu.stage!.children[0].children[1];
    expect(buildingLayer.children.filter((child) => child.label.startsWith('stable-l')).map((child) => child.label))
      .toEqual(tier > 0 ? [`stable-l${tier}`] : []);
    renderer.destroy();
  });
  it('applies a confirmed stable overlay after loading even when resources refresh in between', async () => {
    const now = 1800000000000;
    const view = projectWorld(executeCommand(createWorld(now), 'p', { type: 'found', name: 'اختبار' }, now), 'p', now);
    const village = { ...view.villages[0], buildings: { ...view.villages[0].buildings, stable: 2 } };
    const props: VillageCanvasProps = {
      view, village, selected: null, onSelect: vi.fn(), quality: 'low', reducedMotion: true, showLabels: false,
    };
    const quality = resolveVillageQuality('low', { width: 768, dpr: 1 });
    const renderer = await createVillageRenderer(document.createElement('canvas'), props, quality,
      { gold: 'gold', light: 'white', water: 'white', dust: 'gold' });
    let resolve!: (texture: Texture) => void;
    const loading = new Promise<Texture>((done) => { resolve = done; });
    const assetLoad = vi.mocked(Assets.load as (src: string) => Promise<Texture>);
    assetLoad.mockImplementationOnce(() => loading);
    const confirmed = { ...props, village: { ...village, buildings: { ...village.buildings, stable: 3 } } };
    renderer.update(confirmed, quality);
    renderer.update({ ...confirmed, village: { ...confirmed.village, resources: { ...village.resources, wood: 900 } } }, quality);
    const texture = new Texture({ source: new TextureSource({ width: 111, height: 67 }) });
    resolve(texture);
    await vi.waitFor(() => {
      const buildingLayer = gpu.stage!.children[0].children[1];
      expect(buildingLayer.children.some((child) => child.label === 'stable-l3')).toBe(true);
    });
    const approvedLoad = assetLoad.mock.calls.filter(([src]) => src === '/approved/stable-l3.webp');
    expect(approvedLoad).toHaveLength(1);
    renderer.destroy();
  });
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
  it('rebuilds presentation when visualTier changes without creating another Pixi application', async () => {
    const now = 1800000000000;
    const view = projectWorld(
      executeCommand(createWorld(now), 'p', { type: 'found', name: 'اختبار' }, now),
      'p',
      now,
    );
    const props: VillageCanvasProps = {
      view,
      village: { ...view.villages[0], progression: { ...view.villages[0].progression!, visualTier: 1 } },
      selected: null,
      onSelect: vi.fn(),
      quality: 'high',
      reducedMotion: true,
      showLabels: false,
    };
    const renderer = await createVillageRenderer(
      document.createElement('canvas'),
      props,
      resolveVillageQuality('high', { width: 1280, height: 720, dpr: 2 }),
      { gold: 'gold', light: 'white', water: 'white', dust: 'gold' },
    );
    expect(gpu.initCount).toBe(1);
    renderer.update(
      { ...props, village: { ...props.village, progression: { ...props.village.progression!, visualTier: 6 } } },
      resolveVillageQuality('ultra', { width: 1280, height: 720, dpr: 2 }),
    );
    expect(gpu.initCount).toBe(1);
    const loaded = vi.mocked(Assets.load as (src: string) => Promise<Texture>).mock.calls.map(([src]) => src);
    expect(loaded).toContain('/game-art/kingdoms/village/mamluk-capital-960.webp');
    expect(loaded.some((src) => src.includes('mamluk-capital-1672') || src.includes('mamluk-capital-1280'))).toBe(false);
    renderer.destroy();
  });
});

import { AnimatedSprite, Container, Sprite, Texture, TextureSource } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { villageAssets } from '@/lib/kingdoms/village/assetManifest';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import { resolveVillageQuality } from '@/lib/kingdoms/village/quality';
import type { VillageCanvasProps } from '@/lib/kingdoms/village/types';
import { collectAssetAnimations, createArtworkTextureCache, createBuildingLayer, createNPCLayer } from './village-layers';

vi.mock('@/lib/kingdoms/village/assetManifest', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/kingdoms/village/assetManifest')>();
  return { ...actual, villageAssets: { ...actual.villageAssets, buildings: {
    ...actual.villageAssets.buildings,
    stable: actual.villageAssets.buildings.stable.map((slot, index) => index === 2
      ? { ...slot, src: null, animated: true, frames: ['/approved/stable-a.webp', '/approved/stable-b.webp'] } : slot),
  } } };
});

function originalArtwork() {
  const image = document.createElement('img');
  return new Texture({ source: new TextureSource({ resource: image, width: 1536, height: 1024 }) });
}

function canvasFactory() {
  const context = {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    clip: vi.fn(),
    drawImage: vi.fn(),
  };
  const createCanvas = vi.fn(() => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue(
      context as unknown as ReturnType<HTMLCanvasElement['getContext']>,
    );
    return canvas;
  });
  return { context, createCanvas };
}

describe('original artwork alpha crops', () => {
  it.each([[400, 200], [400, 600]])('contains stable artwork without distortion or moving its ground anchor (%i×%i)', (width, height) => {
    const now = 1800000000000;
    const view = projectWorld(executeCommand(createWorld(now), 'p', { type: 'found', name: 'اختبار' }, now), 'p', now);
    const props: VillageCanvasProps = {
      view, village: { ...view.villages[0], buildings: { ...view.villages[0].buildings, barracks: 1 } },
      selected: null, onSelect: vi.fn(), quality: 'low', reducedMotion: true, showLabels: false,
    };
    const source = originalArtwork();
    const cache = createArtworkTextureCache(source, canvasFactory().createCanvas);
    const texture = new Texture({ source: new TextureSource({ width, height }) });
    const approved = new Map([['/game-art/kingdoms/village/buildings/stable-l1.webp', texture]]);
    const layer = createBuildingLayer(source, props, [], approved, cache);
    const sprite = layer.children.find((child) => child.label === 'stable-l1') as Sprite;
    expect(sprite).toBeInstanceOf(Sprite);
    expect(sprite.scale.x).toBeCloseTo(sprite.scale.y);
    expect(sprite.width / sprite.height).toBeCloseTo(width / height);
    expect(sprite.width).toBeLessThanOrEqual(111 + 1e-6);
    expect(sprite.height).toBeLessThanOrEqual(67 + 1e-6);
    expect(sprite.anchor.x).toBe(0.5);
    expect(sprite.anchor.y).toBe(1);
    expect(sprite.position.x).toBe(509.5);
    expect(sprite.position.y).toBe(583);
    expect(sprite.zIndex).toBe(583);
    const bounds = sprite.getBounds();
    expect(bounds.minX).toBeGreaterThanOrEqual(454 - 1e-6);
    expect(bounds.maxX).toBeLessThanOrEqual(565 + 1e-6);
    expect(bounds.minY).toBeGreaterThanOrEqual(516 - 1e-6);
    expect(bounds.maxY).toBeLessThanOrEqual(583 + 1e-6);
    const pending = createBuildingLayer(source, { ...props, village: { ...props.village,
      buildings: { ...props.village.buildings, barracks: 0 },
      build: { building: 'barracks', level: 1, endsAt: now + 5000 } } }, [], approved, cache);
    expect(pending.children.some((child) => child.label.startsWith('stable-l'))).toBe(false);
    pending.destroy({ children: true });
    layer.destroy({ children: true });
    cache.destroy();
    texture.destroy(true);
  });
  it('renders frames-only stable assets at the confirmed level using the scene-owned ticker', () => {
    const now = 1800000000000;
    const view = projectWorld(executeCommand(createWorld(now), 'p', { type: 'found', name: 'اختبار' }, now), 'p', now);
    const village = { ...view.villages[0], buildings: { ...view.villages[0].buildings, barracks: 2 },
      build: { building: 'barracks' as const, level: 3, endsAt: now + 5000 } };
    const props: VillageCanvasProps = { view, village, selected: null, onSelect: vi.fn(), quality: 'low', reducedMotion: true, showLabels: false };
    const source = originalArtwork();
    const { createCanvas } = canvasFactory();
    const cache = createArtworkTextureCache(source, createCanvas);
    const approved = new Map([['/approved/stable-a.webp', source], ['/approved/stable-b.webp', source]]);
    const pending = createBuildingLayer(source, props, [], approved, cache);
    expect(pending.children.some((child) => child.label === 'stable-l3')).toBe(false);
    const confirmed = createBuildingLayer(source, { ...props, village: { ...village,
      buildings: { ...village.buildings, barracks: 3 }, build: undefined } }, [], approved, cache);
    const sprite = confirmed.children.find((child) => child.label === 'stable-l3') as AnimatedSprite;
    expect(sprite).toBeInstanceOf(AnimatedSprite);
    expect(sprite.autoUpdate).toBe(false);
    expect(sprite.width).toBeCloseTo(100.5);
    expect(sprite.height).toBe(67);
    expect(sprite.scale.x).toBeCloseTo(sprite.scale.y);
    expect(collectAssetAnimations(confirmed)).toEqual([sprite]);
    pending.destroy({ children: true });
    confirmed.destroy({ children: true });
    cache.destroy();
  });
  it('reuses NPC containers and sprites when rebuilding an existing scene', () => {
    const now = 1800000000000;
    const view = projectWorld(executeCommand(createWorld(now), 'p', { type: 'found', name: 'اختبار' }, now), 'p', now);
    const props: VillageCanvasProps = {
      view, village: view.villages[0], selected: null, onSelect: vi.fn(),
      quality: 'medium', reducedMotion: false, showLabels: false,
    };
    const source = originalArtwork();
    const { createCanvas } = canvasFactory();
    const cache = createArtworkTextureCache(source, createCanvas);
    const pool = new Map<string, Container>();
    const quality = resolveVillageQuality('medium', { width: 768, dpr: 2 });
    const first = createNPCLayer(source, props, quality, [], new Map(), cache, pool);
    const figure = first.layer.children[0];
    const sprite = figure.children[0];
    first.layer.removeChildren();
    first.layer.destroy();
    const second = createNPCLayer(source, { ...props }, quality, [], new Map(), cache, pool);
    expect(second.layer.children[0]).toBe(figure);
    expect(second.layer.children[0].children[0]).toBe(sprite);
    second.layer.destroy({ children: true });
    cache.destroy();
  });
  it('clips original pixels once, caches the outline, and destroys only its owned GPU resources', () => {
    const source = originalArtwork();
    const { context, createCanvas } = canvasFactory();
    const cache = createArtworkTextureCache(source, createCanvas);
    const crop = { x: 399, y: 505, width: 9, height: 18 };
    const outline = [2, 0, 7, 0, 9, 18, 0, 18];
    const texture = cache.get(crop, outline)!;
    const ownedSource = texture.source;
    expect(cache.get({ ...crop }, [...outline])).toBe(texture);
    expect(createCanvas).toHaveBeenCalledTimes(1);
    expect(context.clip).toHaveBeenCalledOnce();
    expect(context.drawImage).toHaveBeenCalledWith(
      source.source.resource,
      399,
      505,
      9,
      18,
      0,
      0,
      9,
      18,
    );
    expect(context.moveTo).toHaveBeenCalledWith(2, 0);
    expect(texture.width).toBe(9);
    expect(texture.height).toBe(18);
    expect(texture.source).not.toBe(source.source);
    expect(cache.get(crop, [0, 0, 9, 0, 9, 18, 0, 18])).not.toBe(texture);
    cache.destroy();
    cache.destroy();
    expect(texture.destroyed).toBe(true);
    expect(ownedSource.destroyed).toBe(true);
    expect(source.destroyed).toBe(false);
    expect(source.source.destroyed).toBe(false);
    expect(source.frame.width).toBe(1536);
    expect(source.frame.height).toBe(1024);
  });

  it('renders moving figures and upgraded field/stall details without runtime GPU masks', () => {
    const now = 1800000000000;
    const view = projectWorld(
      executeCommand(createWorld(now), 'p', { type: 'found', name: 'اختبار' }, now),
      'p',
      now,
    );
    const props: VillageCanvasProps = {
      view,
      village: {
        ...view.villages[0],
        buildings: { ...view.villages[0].buildings, farm: 3, market: 3 },
      },
      selected: null,
      onSelect: vi.fn(),
      quality: 'medium',
      reducedMotion: false,
      showLabels: false,
    };
    const source = originalArtwork();
    const { createCanvas } = canvasFactory();
    const cache = createArtworkTextureCache(source, createCanvas);
    const textures: Texture[] = [];
    const approved = new Map<string, Texture>();
    const quality = resolveVillageQuality('medium', { width: 768, dpr: 2 });
    const buildings = createBuildingLayer(source, props, textures, approved, cache);
    const npcs = createNPCLayer(source, props, quality, textures, approved, cache);
    expect(buildings.children).toHaveLength(4);
    for (const sprite of buildings.children) {
      expect(sprite.mask).toBeFalsy();
      expect((sprite as Sprite).texture.source).not.toBe(source.source);
    }
    expect(npcs.layer.children.length).toBeGreaterThan(0);
    for (const figure of npcs.layer.children) {
      expect(figure.children).toHaveLength(1);
      expect(figure.children[0].mask).toBeFalsy();
    }
    const cropsAfterFirstBuild = createCanvas.mock.calls.length;
    npcs.update(1000);
    npcs.update(2000);
    createNPCLayer(source, props, quality, textures, approved, cache);
    createBuildingLayer(source, props, textures, approved, cache);
    expect(createCanvas).toHaveBeenCalledTimes(cropsAfterFirstBuild);
    expect(cropsAfterFirstBuild).toBeGreaterThanOrEqual(3);
    expect(villageAssets.npc.farmer.fallbackCrop?.width).toBe(9);
    buildings.destroy({ children: true });
    npcs.layer.destroy({ children: true });
    cache.destroy();
    textures.forEach((texture) => texture.destroy());
  });
});

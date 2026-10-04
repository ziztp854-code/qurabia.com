import { Sprite, Texture, TextureSource } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import { resourceBuildingIds, resolveVillageAssetSrc, villageAssets } from '@/lib/kingdoms/village/assetManifest';
import { getVillageRect } from '@/lib/kingdoms/village/coordinates';
import type { VillageCanvasProps } from '@/lib/kingdoms/village/types';
import { createBuildingLayer } from './village-layers';

const now = 1800000000000;
const view = projectWorld(executeCommand(createWorld(now), 'p', { type: 'found', name: 'اختبار' }, now), 'p', now);
const props: VillageCanvasProps = { view, village: view.villages[0], selected: null, onSelect: vi.fn(), quality: 'high', reducedMotion: true, showLabels: true };
const artwork = { get: vi.fn(() => null), destroy: vi.fn() };

describe('independent resource artwork', () => {
  it.each(resourceBuildingIds)('renders %s from its approved HiDPI texture at the confirmed level', (id) => {
    const source = new Texture({ source: new TextureSource({ width: 960, height: 540 }) });
    const texture = new Texture({ source: new TextureSource({ width: 600, height: 400 }) });
    const slot = villageAssets.buildings[id][2];
    const approved = new Map([[resolveVillageAssetSrc(slot, 'hidpi')!, texture]]);
    const village = { ...props.village, buildings: { ...props.village.buildings, [id]: 3 },
      build: { building: id, level: 4, endsAt: now + 5000 } };
    const layer = createBuildingLayer(source, { ...props, village }, [], approved, artwork, 'hidpi');
    const sprite = layer.children.find((child) => child.label === `${id}-l3`) as Sprite;
    expect(sprite).toBeInstanceOf(Sprite);
    expect(sprite.texture).toBe(texture);
    expect(layer.children.some((child) => child.label === `${id}-l4`)).toBe(false);
    expect(sprite.width / sprite.height).toBeCloseTo(1.5);
    const rect = getVillageRect(id);
    expect(sprite.width).toBeLessThanOrEqual(rect.width + 1e-6);
    expect(sprite.height).toBeLessThanOrEqual(rect.height + 1e-6);
    expect(sprite.position.x).toBe(rect.x + rect.width / 2);
    expect(sprite.position.y).toBe(rect.y + rect.height);
    layer.destroy({ children: true });
    texture.destroy(true); source.destroy(true);
  });
  it('keeps an unbuilt resource plot empty until construction is confirmed', () => {
    const source = new Texture({ source: new TextureSource({ width: 960, height: 540 }) });
    const texture = new Texture({ source: new TextureSource({ width: 600, height: 400 }) });
    const approved = new Map([[resolveVillageAssetSrc(villageAssets.buildings.lumber[0], 'hidpi')!, texture]]);
    const village = { ...props.village, buildings: { ...props.village.buildings, lumber: 0 },
      build: { building: 'lumber' as const, level: 1, endsAt: now + 5000 } };
    const before = createBuildingLayer(source, { ...props, village }, [], approved, artwork, 'hidpi');
    expect(before.children.some((child) => child.label.startsWith('lumber-l'))).toBe(false);
    const after = createBuildingLayer(source, { ...props, village: { ...village,
      buildings: { ...village.buildings, lumber: 1 }, build: undefined } }, [], approved, artwork, 'hidpi');
    expect(after.children.some((child) => child.label === 'lumber-l1')).toBe(true);
    before.destroy({ children: true }); after.destroy({ children: true });
    texture.destroy(true); source.destroy(true);
  });
});

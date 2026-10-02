import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { villageAssets, type VillageAssetSlot } from '@/lib/kingdoms/village/assetManifest';
import { getBuildingPresentation } from '@/lib/kingdoms/village/buildingConfig';
import { getBuildingRect, rectCenter } from '@/lib/kingdoms/village/coordinates';
import { createVillageNPCs, npcPosition, type NPCSpawn } from '@/lib/kingdoms/village/npcRoutes';
import type { QualitySettings } from '@/lib/kingdoms/village/quality';
import type { VillageCanvasProps, WorldPoint, WorldRect } from '@/lib/kingdoms/village/types';
import { buildingKeys, type Building } from '@/lib/kingdoms/types';

export type SceneColors = Readonly<{ gold: string; light: string; water: string; dust: string }>;

export type ArtworkTextureCache = {
  get: (crop: WorldRect, outline: readonly number[]) => Texture | null;
  destroy: () => void;
};

export function createArtworkTextureCache(
  source: Texture,
  createCanvas = () => document.createElement('canvas'),
): ArtworkTextureCache {
  const textures = new Map<string, Texture | null>();
  let disposed = false;
  return {
    get(crop, outline) {
      if (disposed) return null;
      const key = JSON.stringify([crop.x, crop.y, crop.width, crop.height, ...outline]);
      if (textures.has(key)) return textures.get(key) ?? null;
      const canvas = createCanvas();
      canvas.width = crop.width;
      canvas.height = crop.height;
      const context = canvas.getContext('2d');
      if (!context || !source.source.resource) {
        textures.set(key, null);
        return null;
      }
      // Cut original pixels once. Moving sprites must not alter the shared GPU stencil state.
      context.beginPath();
      context.moveTo(outline[0], outline[1]);
      for (let index = 2; index < outline.length; index += 2)
        context.lineTo(outline[index], outline[index + 1]);
      context.closePath();
      context.clip();
      context.drawImage(
        source.source.resource as CanvasImageSource,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        crop.width,
        crop.height,
      );
      const texture = Texture.from(canvas, true);
      textures.set(key, texture);
      return texture;
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      textures.forEach((texture) => texture?.destroy(true));
      textures.clear();
    },
  };
}

export function artworkSprite(
  source: Texture,
  slot: VillageAssetSlot,
  textures: Texture[],
  approved: ReadonlyMap<string, Texture>,
  artwork?: ArtworkTextureCache,
  outline?: readonly number[],
): Sprite | null {
  if (slot.src && approved.has(slot.src)) return new Sprite(approved.get(slot.src));
  if (!slot.fallbackCrop) return null;
  const crop = slot.fallbackCrop;
  if (artwork && outline) {
    const texture = artwork.get(crop, outline);
    return texture ? new Sprite(texture) : null;
  }
  const texture = new Texture({
    source: source.source,
    frame: new Rectangle(crop.x, crop.y, crop.width, crop.height),
  });
  textures.push(texture);
  return new Sprite(texture);
}

export function createBuildingLayer(
  source: Texture,
  props: VillageCanvasProps,
  textures: Texture[],
  approved: ReadonlyMap<string, Texture>,
  artwork: ArtworkTextureCache,
) {
  const layer = new Container();
  for (const building of buildingKeys) {
    const confirmed = props.village.buildings[building];
    const level =
      process.env.NODE_ENV === 'development' && props.debug?.building === building
        ? (props.debug.buildingLevel ?? confirmed)
        : confirmed;
    const tier = Math.max(0, Math.min(5, level));
    const slot = villageAssets.buildings[building][Math.max(0, tier - 1)];
    if (slot?.src && approved.has(slot.src) && tier > 0) {
      const sprite = artworkSprite(source, slot, textures, approved);
      if (sprite) {
        const rect = getBuildingRect(building, props.debug);
        sprite.position.set(rect.x, rect.y);
        sprite.width = rect.width;
        sprite.height = rect.height;
        layer.addChild(sprite);
      }
      continue;
    }
    if (!slot?.fallbackCrop || tier < 2) continue;
    const outline =
      building === 'farm'
        ? [0, 12, 35, 0, 56, 14, 22, 36]
        : building === 'market'
          ? [0, 18, 21, 0, 43, 18, 36, 34, 7, 34]
          : undefined;
    for (let index = 0; index < tier - 1; index += 1) {
      const sprite = artworkSprite(source, slot, textures, approved, artwork, outline);
      if (!sprite) continue;
      // Small, replaceable art details only; never duplicate the main building.
      if (building === 'farm') {
        sprite.position.set(1190 + index * 53, 414 - index * 11);
        sprite.scale.set(0.8);
        layer.addChild(sprite);
      } else if (building === 'hall') {
        sprite.position.set(620 + index * 56, 345 + (index % 2) * 8);
        sprite.scale.set(0.8);
        layer.addChild(sprite);
      } else if (building === 'wall') {
        sprite.position.set(564 + index * 121, 820);
        sprite.scale.set(0.7);
        layer.addChild(sprite);
      } else if (building === 'market') {
        sprite.position.set(1085 + index * 48, 649 + (index % 2) * 14);
        sprite.scale.set(0.65);
        layer.addChild(sprite);
      }
      sprite.alpha = 0.86;
    }
  }
  return layer;
}

export function createNPCLayer(
  source: Texture,
  props: VillageCanvasProps,
  quality: QualitySettings,
  textures: Texture[],
  approved: ReadonlyMap<string, Texture>,
  artwork: ArtworkTextureCache,
) {
  const layer = new Container();
  layer.sortableChildren = true;
  const preview =
    process.env.NODE_ENV === 'development' &&
    props.debug?.building &&
    props.debug.buildingLevel !== undefined
      ? {
          ...props.village,
          buildings: {
            ...props.village.buildings,
            [props.debug.building]: props.debug.buildingLevel,
          },
        }
      : props.village;
  const npcs = createVillageNPCs(preview, quality.npcLimit).map(
    (npc): { model: NPCSpawn; container: Container } => {
      const container = new Container();
      const slot = villageAssets.npc[npc.kind];
      const width = slot.fallbackCrop?.width ?? 0;
      const height = slot.fallbackCrop?.height ?? 0;
      const outline =
        npc.kind === 'horse' || npc.kind === 'cart'
          ? [0, height * 0.4, width / 2, 0, width, height * 0.4, width, height, 0, height]
          : [
              width * 0.32,
              0,
              width * 0.68,
              0,
              width * 0.95,
              height * 0.4,
              width * 0.85,
              height,
              width * 0.15,
              height,
              width * 0.05,
              height * 0.4,
            ];
      const sprite = artworkSprite(source, slot, textures, approved, artwork, outline);
      if (sprite) {
        sprite.anchor.set(0.5, 1);
        if (slot.src && approved.has(slot.src)) {
          sprite.height = npc.kind === 'horse' || npc.kind === 'cart' ? 19 : 18;
          sprite.scale.x = sprite.scale.y;
        }
        container.addChild(sprite);
      }
      layer.addChild(container);
      if (npc.id.startsWith('construction') && props.village.build) {
        const center = rectCenter(getBuildingRect(props.village.build.building, props.debug));
        return {
          model: {
            ...npc,
            route: npc.route.map((point) => ({
              x: center.x + point.x - 760,
              y: center.y + point.y - 500,
            })),
          },
          container,
        };
      }
      return { model: npc, container };
    },
  );
  const update = (elapsed: number) => {
    for (const npc of npcs) {
      const point = npcPosition(npc.model, elapsed);
      npc.container.position.set(point.x, point.y);
      npc.container.scale.x = point.facing;
      npc.container.zIndex = point.y;
    }
  };
  update(0);
  layer.visible = props.debug?.npcs !== false;
  return { layer, update };
}

export function createEnvironmentLayer(
  source: Texture,
  textures: Texture[],
  approved: ReadonlyMap<string, Texture>,
) {
  const layer = new Container();
  const glints = new Graphics();
  const flag = artworkSprite(source, villageAssets.environment.flags, textures, approved);
  if (flag) {
    flag.position.set(836, 345);
    flag.width = 14;
    flag.height = 44;
    layer.addChild(flag);
  }
  layer.addChild(glints);
  return { layer, glints, flag, flagScale: flag?.scale.x ?? 1 };
}

export function paintEnvironment(
  graphics: Graphics,
  elapsed: number,
  colors: SceneColors,
  particles: boolean,
) {
  graphics.clear();
  const seconds = elapsed / 1000;
  if (particles) {
    for (let i = 0; i < 12; i += 1) {
      const phase = (seconds * 0.22 + i * 0.137) % 1;
      graphics
        .circle(146 + Math.sin(i * 7) * 15, 66 + phase * 162, 1.2 + phase)
        .fill({ color: colors.light, alpha: Math.sin(phase * Math.PI) * 0.22 });
    }
  }
  for (let i = 0; i < 10; i += 1) {
    const x = 280 + i * 118;
    const y = 944 + Math.sin(i * 8) * 28;
    graphics
      .moveTo(x, y)
      .lineTo(x + 12 + Math.sin(seconds * 0.7 + i) * 5, y + 1)
      .stroke({
        color: colors.water,
        width: 1.3,
        alpha: (Math.sin(seconds * 0.5 + i * 2.7) + 1) * 0.11,
      });
  }
  for (const [x, y] of [
    [692, 744],
    [827, 749],
    [718, 863],
    [795, 865],
  ]) {
    graphics
      .circle(x, y, 5 + Math.sin(seconds * 3.8 + x) * 0.8)
      .fill({ color: colors.gold, alpha: 0.08 + (Math.sin(seconds * 5.7 + y) + 1) * 0.025 });
  }
}

export function paintInteraction(
  graphics: Graphics,
  props: VillageCanvasProps,
  hovered: Building | null,
  colors: SceneColors,
) {
  graphics.clear();
  for (const building of buildingKeys) {
    const rect = getBuildingRect(building, props.debug);
    if (props.selected === building || hovered === building) {
      graphics
        .roundRect(rect.x, rect.y, rect.width, rect.height, 22)
        .fill({ color: colors.gold, alpha: hovered === building ? 0.07 : 0.025 })
        .stroke({ color: colors.gold, width: hovered === building ? 2.2 : 1.3, alpha: 0.8 });
    }
    if (process.env.NODE_ENV === 'development' && props.debug?.hitboxes)
      graphics
        .rect(rect.x, rect.y, rect.width, rect.height)
        .stroke({ color: colors.light, width: 1, alpha: 0.9 });
  }
}

export function paintConstruction(
  graphics: Graphics,
  props: VillageCanvasProps,
  elapsed: number,
  colors: SceneColors,
  particles: boolean,
  completed: readonly WorldPoint[],
) {
  graphics.clear();
  if (props.village.build && particles) {
    const rect = getBuildingRect(props.village.build.building, props.debug);
    for (let i = 0; i < 9; i += 1) {
      const phase = (elapsed / 1700 + i * 0.231) % 1;
      graphics
        .circle(
          rect.x + rect.width * (0.2 + (i % 5) * 0.13),
          rect.y + rect.height - phase * 29,
          2 + phase * 4,
        )
        .fill({ color: colors.dust, alpha: Math.sin(phase * Math.PI) * 0.13 });
    }
  }
  for (const point of completed) {
    const radius = 24 + (elapsed % 1500) / 50;
    graphics.ellipse(point.x, point.y, radius, radius * 0.43).stroke({
      color: colors.gold,
      alpha: Math.max(0, 0.7 - (elapsed % 1500) / 2100),
      width: 1.5,
    });
  }
}

export function presentationTier(building: Building, props: VillageCanvasProps) {
  return getBuildingPresentation(building, props.village, props.view.config).tier;
}

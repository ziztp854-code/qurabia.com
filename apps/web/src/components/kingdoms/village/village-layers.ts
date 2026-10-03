import { AnimatedSprite, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import {
  resolveVillageAssetSrc,
  villageAssets,
  type VillageAssetFidelity,
  type VillageAssetSlot,
} from '@/lib/kingdoms/village/assetManifest';
import { villageVisualPresentation } from '@/lib/kingdoms/village/visual-tier';
import { getBuildingPresentation } from '@/lib/kingdoms/village/buildingConfig';
import { getVillageBuilding, getVillageVisualLevel, villageBuildingRegistry } from '@/lib/kingdoms/village/buildingRegistry';
import { getBuildingRect, getVillagePlacement, getVillageRect, rectCenter } from '@/lib/kingdoms/village/coordinates';
import { createVillageNPCs, npcPosition, type NPCSpawn } from '@/lib/kingdoms/village/npcRoutes';
import type { QualitySettings } from '@/lib/kingdoms/village/quality';
import type { VillageCanvasProps, VillageSelection, WorldPoint, WorldRect } from '@/lib/kingdoms/village/types';
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

export function hasApprovedAsset(
  slot: VillageAssetSlot,
  approved: ReadonlyMap<string, Texture>,
  fidelity: VillageAssetFidelity = 'standard',
) {
  const src = resolveVillageAssetSrc(slot, fidelity);
  return (!!src && approved.has(src)) ||
    (slot.frames.length > 0 && slot.frames.every((frame) => approved.has(frame)));
}

export function artworkSprite(
  source: Texture,
  slot: VillageAssetSlot,
  textures: Texture[],
  approved: ReadonlyMap<string, Texture>,
  artwork?: ArtworkTextureCache,
  outline?: readonly number[],
  fidelity: VillageAssetFidelity = 'standard',
): Sprite | null {
  if (slot.animated && slot.frames.length > 1 && slot.frames.every((frame) => approved.has(frame))) {
    // This renderer owns animation time; never start Pixi's shared ticker.
    return new AnimatedSprite(slot.frames.map((frame) => approved.get(frame)!), false);
  }
  const src = resolveVillageAssetSrc(slot, fidelity);
  if (src && approved.has(src)) return new Sprite(approved.get(src));
  if (slot.frames.length && slot.frames.every((frame) => approved.has(frame)))
    return new Sprite(approved.get(slot.frames[0]));
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
  layer.sortableChildren = true;
  const visualTier = Math.min(villageAssets.tiers.length, Math.max(1, props.village.progression?.visualTier ?? 1));
  const tierSlot = villageAssets.tiers[visualTier - 1];
  for (let index = 0; index < visualTier - 1; index += 1) {
    const banner = artworkSprite(source, tierSlot, textures, approved);
    if (!banner) continue;
    banner.position.set(640 + index * 80, 760 + (index % 2) * 18);
    banner.scale.set(0.9 + index * 0.04);
    banner.zIndex = 820;
    banner.label = `village-tier-banner-${index}`;
    layer.addChild(banner);
  }
  for (const entry of villageBuildingRegistry) {
    const building = entry.id;
    const tier = getVillageVisualLevel(building, props.village, props.debug);
    const slot = villageAssets.buildings[building][Math.max(0, tier - 1)];
    if (slot && hasApprovedAsset(slot, approved) && tier > 0) {
      const sprite = artworkSprite(source, slot, textures, approved);
      if (sprite) {
        const rect = getVillageRect(building, props.debug);
        sprite.anchor.set(slot.anchor.x, slot.anchor.y);
        sprite.position.set(rect.x + rect.width * slot.anchor.x, rect.y + rect.height * slot.anchor.y);
        if (slot.fit === 'contain') {
          const scale = Math.min(rect.width / sprite.texture.width, rect.height / sprite.texture.height);
          sprite.scale.set(scale);
        } else {
          sprite.width = rect.width;
          sprite.height = rect.height;
        }
        sprite.zIndex = getVillagePlacement(building, props.debug).zIndex;
        sprite.label = slot.id;
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
  pool: Map<string, Container> = new Map(),
) {
  const layer = new Container();
  layer.sortableChildren = true;
  const previewBuilding = props.debug?.building
    ? getVillageBuilding(props.debug.building).building : undefined;
  const preview =
    process.env.NODE_ENV === 'development' &&
    previewBuilding &&
    props.debug?.building &&
    props.debug.buildingLevel !== undefined
      ? {
          ...props.village,
          buildings: {
            ...props.village.buildings,
            [previewBuilding]: props.debug.buildingLevel,
          },
        }
      : props.village;
  const npcs = createVillageNPCs(preview, quality.npcLimit).map(
    (npc): { model: NPCSpawn; container: Container } => {
      const container = pool.get(npc.id) ?? new Container();
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
      let cachedSprite = container.children[0] as Sprite | undefined;
      if (cachedSprite && !(cachedSprite instanceof AnimatedSprite) && slot.animated &&
          slot.frames.length > 1 && slot.frames.every((frame) => approved.has(frame))) {
        container.removeChild(cachedSprite);
        cachedSprite.destroy();
        cachedSprite = undefined;
      }
      const sprite = cachedSprite ?? artworkSprite(source, slot, textures, approved, artwork, outline);
      if (sprite) {
        const approvedTexture = (slot.src ? approved.get(slot.src) : undefined) ?? approved.get(slot.frames[0]);
        if (!(sprite instanceof AnimatedSprite) && approvedTexture) sprite.texture = approvedTexture;
        sprite.anchor.set(0.5, 1);
        if (hasApprovedAsset(slot, approved)) {
          sprite.width = slot.worldRect.width;
          sprite.height = slot.worldRect.height;
        }
        if (!cachedSprite) container.addChild(sprite);
      }
      pool.set(npc.id, container);
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
  visualTier?: number,
  fidelity: VillageAssetFidelity = 'standard',
) {
  const look = villageVisualPresentation(visualTier);
  const layer = new Container();
  layer.sortableChildren = true;
  layer.label = 'village-environment';
  const glints = new Graphics();
  for (const [id, slot] of Object.entries(villageAssets.environment)) {
    if (id === 'flags' || id === 'scaffold' || (!slot.src && !slot.frames.length)) continue;
    const sprite = artworkSprite(source, slot, textures, approved, undefined, undefined, fidelity);
    if (!sprite) continue;
    const rect = slot.worldRect;
    sprite.anchor.set(slot.anchor.x, slot.anchor.y);
    sprite.position.set(rect.x + slot.anchor.x * rect.width, rect.y + slot.anchor.y * rect.height);
    sprite.width = rect.width;
    sprite.height = rect.height;
    sprite.zIndex = slot.zIndex;
    layer.addChild(sprite);
  }
  const flag = artworkSprite(
    source,
    villageAssets.environment.flags,
    textures,
    approved,
    undefined,
    undefined,
    fidelity,
  );
  if (flag) {
    const slot = villageAssets.environment.flags;
    const isApproved = hasApprovedAsset(slot, approved, fidelity);
    const rect = isApproved ? slot.worldRect : { x: 836, y: 345, width: 14, height: 44 };
    flag.anchor.set(isApproved ? slot.anchor.x : 0, isApproved ? slot.anchor.y : 0);
    flag.position.set(rect.x + flag.anchor.x * rect.width, rect.y + flag.anchor.y * rect.height);
    flag.width = rect.width;
    flag.height = rect.height;
    flag.zIndex = slot.zIndex;
    flag.label = 'village-flag-0';
    layer.addChild(flag);
    for (let index = 1; index < look.flagCount; index += 1) {
      const extra = artworkSprite(
        source,
        villageAssets.environment.flags,
        textures,
        approved,
        undefined,
        undefined,
        fidelity,
      );
      if (!extra) continue;
      extra.anchor.copyFrom(flag.anchor);
      extra.position.set(rect.x + index * 22, rect.y + (index % 2) * 10);
      extra.width = rect.width;
      extra.height = rect.height;
      extra.zIndex = slot.zIndex;
      extra.label = `village-flag-${index}`;
      layer.addChild(extra);
    }
    if (look.marketAmbience) {
      const market = artworkSprite(
        source,
        villageAssets.environment.flags,
        textures,
        approved,
        undefined,
        undefined,
        fidelity,
      );
      if (market) {
        market.position.set(1092, 686);
        market.width = rect.width;
        market.height = rect.height;
        market.label = 'village-market-banner';
        layer.addChild(market);
      }
    }
    if (look.militaryAmbience) {
      const military = artworkSprite(
        source,
        villageAssets.environment.flags,
        textures,
        approved,
        undefined,
        undefined,
        fidelity,
      );
      if (military) {
        military.position.set(421, 505);
        military.width = rect.width;
        military.height = rect.height;
        military.label = 'village-military-banner';
        layer.addChild(military);
      }
    }
  }
  layer.addChild(glints);
  return {
    layer,
    glints,
    flag,
    flagScale: flag?.scale.x ?? 1,
    flagSway: !hasApprovedAsset(villageAssets.environment.flags, approved, fidelity),
    look,
  };
}

export function createConstructionAssetLayer(
  source: Texture,
  props: VillageCanvasProps,
  textures: Texture[],
  approved: ReadonlyMap<string, Texture>,
  fidelity: VillageAssetFidelity = 'standard',
) {
  const layer = new Container();
  if (!props.village.build) return layer;
  const slot = villageAssets.environment.scaffold;
  if (!hasApprovedAsset(slot, approved, fidelity)) return layer;
  const sprite = artworkSprite(source, slot, textures, approved, undefined, undefined, fidelity);
  if (sprite) {
    const rect = getBuildingRect(props.village.build.building, props.debug);
    sprite.anchor.set(slot.anchor.x, slot.anchor.y);
    sprite.position.set(rect.x + rect.width * slot.anchor.x, rect.y + rect.height * slot.anchor.y);
    sprite.width = rect.width;
    sprite.height = rect.height;
    layer.addChild(sprite);
  }
  return layer;
}

export function createRoadLayer(
  source: Texture,
  textures: Texture[],
  approved: ReadonlyMap<string, Texture>,
  fidelity: VillageAssetFidelity = 'standard',
) {
  const layer = new Container();
  layer.label = 'village-roads';
  const slot = villageAssets.roads;
  if (!hasApprovedAsset(slot, approved, fidelity)) return layer;
  const sprite = artworkSprite(source, slot, textures, approved, undefined, undefined, fidelity);
  if (sprite) {
    const rect = slot.worldRect;
    sprite.anchor.set(slot.anchor.x, slot.anchor.y);
    sprite.position.set(rect.x + rect.width * slot.anchor.x, rect.y + rect.height * slot.anchor.y);
    sprite.width = rect.width;
    sprite.height = rect.height;
    layer.addChild(sprite);
  }
  return layer;
}

export function collectAssetAnimations(container: Container): AnimatedSprite[] {
  return container.children.flatMap((child) => [
    ...(child instanceof AnimatedSprite ? [child] : []),
    ...collectAssetAnimations(child),
  ]);
}

export function paintEnvironment(
  graphics: Graphics,
  elapsed: number,
  colors: SceneColors,
  particles: boolean,
  visualTier?: number,
) {
  graphics.clear();
  const look = villageVisualPresentation(visualTier);
  const seconds = elapsed / 1000;
  if (particles) {
    const count = Math.max(4, Math.round(12 * look.particleScale));
    for (let i = 0; i < count; i += 1) {
      const phase = (seconds * 0.22 + i * 0.137) % 1;
      graphics
        .circle(146 + Math.sin(i * 7) * 15, 66 + phase * 162, 1.2 + phase)
        .fill({ color: colors.light, alpha: Math.sin(phase * Math.PI) * 0.22 });
    }
  }
  for (let i = 0; i < look.waterGlints; i += 1) {
    const x = 280 + i * (1180 / Math.max(1, look.waterGlints));
    const y = 944 + Math.sin(i * 8) * 28;
    graphics
      .moveTo(x, y)
      .lineTo(x + 12 + Math.sin(seconds * 0.7 + i) * 5, y + 1)
      .stroke({
        color: colors.water,
        width: look.roadEmphasis ? 1.6 : 1.3,
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
  hovered: VillageSelection | null,
  colors: SceneColors,
) {
  graphics.clear();
  for (const building of [...buildingKeys, 'stable'] as const) {
    const rect = getVillageRect(building, props.debug);
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

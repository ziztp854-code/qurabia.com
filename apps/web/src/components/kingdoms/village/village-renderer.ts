import { Application, Assets, Container, Graphics, type AnimatedSprite, type Texture } from 'pixi.js';
import {
  resolveVillageAssetSrc,
  villageAssetFidelity,
  villageAssets,
  type VillageAssetSlot,
} from '@/lib/kingdoms/village/assetManifest';
import { getVillageVisualLevel, villageBuildingRegistry } from '@/lib/kingdoms/village/buildingRegistry';
import { getBuildingRect, rectCenter } from '@/lib/kingdoms/village/coordinates';
import type { QualitySettings } from '@/lib/kingdoms/village/quality';
import type {
  CameraSnapshot,
  VillageCanvasProps,
  VillageSelection,
  WorldPoint,
  WorldSize,
} from '@/lib/kingdoms/village/types';
import { buildingKeys } from '@/lib/kingdoms/types';
import {
  createArtworkTextureCache,
  createBuildingLayer,
  createEnvironmentLayer,
  createConstructionAssetLayer,
  createNPCLayer,
  createRoadLayer,
  collectAssetAnimations,
  paintConstruction,
  paintEnvironment,
  paintInteraction,
  type SceneColors,
} from './village-layers';

export type VillageRenderer = {
  camera: (snapshot: CameraSnapshot) => void;
  update: (props: VillageCanvasProps, quality: QualitySettings) => void;
  hover: (building: VillageSelection | null) => void;
  setVisible: (visible: boolean) => void;
  destroy: () => void;
};

export async function createVillageRenderer(
  canvas: HTMLCanvasElement,
  initial: VillageCanvasProps,
  quality: QualitySettings,
  colors: SceneColors,
): Promise<VillageRenderer> {
  const app = new Application();
  let viewport: WorldSize = {
    width: canvas.parentElement?.clientWidth || 768,
    height: canvas.parentElement?.clientHeight || 512,
  };
  let surfaceDpr = quality.dpr;
  try {
    await app.init({
      canvas,
      width: viewport.width,
      height: viewport.height,
      backgroundAlpha: 0,
      antialias: false,
      resolution: quality.dpr,
      autoStart: false,
      sharedTicker: false,
      powerPreference: quality.mode === 'low' ? 'low-power' : 'high-performance',
    });
  } catch (error) {
    if (app.renderer) app.destroy(false, { children: true });
    throw error;
  }
  let source: Texture;
  const cropPlate = resolveVillageAssetSrc(villageAssets.base, 'standard') ?? villageAssets.base.src;
  try {
    // Overlay crops use the 1536×1024 plate. Hidpi and ultra stay on the DOM terrain image.
    source = await Assets.load<Texture>(cropPlate);
  } catch (error) {
    app.destroy(false, { children: true });
    throw error;
  }
  const world = new Container();
  app.stage.addChild(world);
  let props = initial;
  let settings = quality;
  let textures: Texture[] = [];
  const artwork = createArtworkTextureCache(source);
  const approved = new Map<string, Texture>();
  const pending = new Map<string, Promise<Texture>>();
  // IDs and counts are bounded by the visual NPC budget; reuse figures across snapshots.
  const npcPool = new Map<string, Container>();
  let buildingLayer: Container;
  let roadLayer: Container;
  let constructionLayer: Container;
  let assetAnimations: AnimatedSprite[] = [];
  let npcs: ReturnType<typeof createNPCLayer>;
  let environment: ReturnType<typeof createEnvironmentLayer>;
  const effects = new Graphics();
  const interactions = new Graphics();
  let hovered: VillageSelection | null = null;
  let elapsed = 0;
  let visible = true;
  let disposed = false;
  let completed: readonly WorldPoint[] = [];
  let completionUntil = 0;
  const resizeSurface = (nextViewport: WorldSize = viewport) => {
    if (
      nextViewport.width === viewport.width &&
      nextViewport.height === viewport.height &&
      settings.dpr === surfaceDpr
    )
      return;
    app.renderer.resize(nextViewport.width, nextViewport.height, settings.dpr);
    viewport = { ...nextViewport };
    surfaceDpr = settings.dpr;
  };

  const loadApprovedAssets = async (next: VillageCanvasProps, nextSettings: QualitySettings) => {
    let changed = false;
    const buildingSlots: VillageAssetSlot[] = villageBuildingRegistry.flatMap(({ id }) => {
      const tier = getVillageVisualLevel(id, next.village, next.debug);
      return tier > 0 ? [villageAssets.buildings[id][tier - 1]] : [];
    });
    const slots: VillageAssetSlot[] = [
      ...buildingSlots,
      villageAssets.roads,
      ...(next.village.build ? [villageAssets.environment.scaffold] : []),
      ...Object.values(villageAssets.npc),
      ...(nextSettings.environment ? Object.values(villageAssets.environment) : []),
    ];
    const fidelity = villageAssetFidelity(nextSettings.mode);
    const terrainPlate = resolveVillageAssetSrc(villageAssets.base, fidelity);
    const standardPlate = resolveVillageAssetSrc(villageAssets.base, 'standard');
    const sources = [
      ...new Set(
        slots.flatMap((slot) => {
          const src = resolveVillageAssetSrc(slot, fidelity);
          return [...(src ? [src] : []), ...slot.frames];
        }),
      ),
    ].filter((src) => src === standardPlate || src !== terrainPlate);
    await Promise.all(
      sources.map(async (src) => {
        if (approved.has(src)) return;
        let loading = pending.get(src);
        if (!loading) {
          loading = Assets.load<Texture>(src);
          pending.set(src, loading);
        }
        try {
          const texture = await loading;
          if (!disposed && approved.get(src) !== texture) {
            approved.set(src, texture);
            changed = true;
          }
        } catch {
          /* Missing optional artwork retains the documented original-art fallback. */
        } finally {
          pending.delete(src);
        }
      }),
    );
    return changed;
  };

  const rebuild = () => {
    if (buildingLayer) {
      world.removeChild(roadLayer, buildingLayer, npcs.layer, environment.layer, constructionLayer, effects, interactions);
      roadLayer.destroy({ children: true });
      buildingLayer.destroy({ children: true });
      npcs.layer.removeChildren();
      npcs.layer.destroy();
      environment.layer.destroy({ children: true });
      constructionLayer.destroy({ children: true });
    }
    textures.forEach((texture) => texture.destroy());
    textures = [];
    const fidelity = villageAssetFidelity(settings.mode);
    roadLayer = createRoadLayer(source, textures, approved, fidelity);
    buildingLayer = createBuildingLayer(source, props, textures, approved, artwork);
    npcs = createNPCLayer(source, props, settings, textures, approved, artwork, npcPool);
    environment = createEnvironmentLayer(
      source,
      textures,
      approved,
      props.village.progression?.visualTier,
      fidelity,
    );
    constructionLayer = createConstructionAssetLayer(source, props, textures, approved, fidelity);
    environment.layer.visible = settings.environment;
    world.addChild(roadLayer, buildingLayer, environment.layer, npcs.layer, constructionLayer, effects, interactions);
    assetAnimations = collectAssetAnimations(world);
    paintInteraction(interactions, props, hovered, colors);
    npcs.update(elapsed);
  };
  const animate = () => !props.reducedMotion && props.debug?.animations !== false;
  const syncTicker = () => {
    app.ticker.maxFPS = settings.fps;
    if (visible && animate()) app.ticker.start();
    else app.ticker.stop();
  };
  await loadApprovedAssets(props, settings);
  rebuild();
  app.ticker.add((ticker) => {
    if (disposed || !visible || !animate()) return;
    elapsed += Math.min(100, ticker.deltaMS);
    assetAnimations.forEach((sprite) => sprite.gotoAndStop(Math.floor(elapsed / 140) % sprite.totalFrames));
    if (props.debug?.npcs !== false) npcs.update(elapsed);
    if (settings.environment) {
      paintEnvironment(
        environment.glints,
        elapsed,
        colors,
        settings.particles,
        props.village.progression?.visualTier,
      );
      if (environment.flag && environment.flagSway)
        environment.flag.scale.x = environment.flagScale * (1 + Math.sin(elapsed / 470) * 0.05);
    }
    paintConstruction(
      effects,
      props,
      elapsed,
      colors,
      settings.particles,
      elapsed < completionUntil ? completed : [],
    );
  });
  const render = () => {
    if (!disposed) app.render();
  };
  syncTicker();
  return {
    camera(snapshot) {
      if (disposed) return;
      resizeSurface(snapshot.viewport);
      world.scale.set(snapshot.scale);
      world.position.set(
        snapshot.viewport.width / 2 - snapshot.x * snapshot.scale,
        snapshot.viewport.height / 2 - snapshot.y * snapshot.scale,
      );
      render();
    },
    update(next, nextQuality) {
      if (disposed) return;
      const newlyCompleted = buildingKeys
        .filter((building) => next.village.buildings[building] > props.village.buildings[building])
        .map((building) => rectCenter(getBuildingRect(building, next.debug)));
      if (newlyCompleted.length) {
        completed = newlyCompleted;
        completionUntil = elapsed + 280;
      }
      const rebuildNeeded =
        next.village.id !== props.village.id ||
        next.village.progression?.visualTier !== props.village.progression?.visualTier ||
        JSON.stringify(next.village.buildings) !== JSON.stringify(props.village.buildings) ||
        JSON.stringify(next.village.troops) !== JSON.stringify(props.village.troops) ||
        next.village.build?.building !== props.village.build?.building ||
        next.debug !== props.debug ||
        nextQuality.npcLimit !== settings.npcLimit ||
        nextQuality.mode !== settings.mode;
      props = next;
      settings = nextQuality;
      if (rebuildNeeded) rebuild();
      if (rebuildNeeded)
        void loadApprovedAssets(props, settings).then((changed) => {
          if (!disposed && changed) {
            rebuild();
            render();
          }
        });
      resizeSurface();
      npcs.layer.visible = props.debug?.npcs !== false;
      environment.layer.visible = settings.environment;
      if (!animate()) {
        effects.clear();
        environment.glints.clear();
      }
      paintInteraction(interactions, props, hovered, colors);
      syncTicker();
      render();
    },
    hover(building) {
      hovered = building;
      paintInteraction(interactions, props, hovered, colors);
      render();
    },
    setVisible(next) {
      visible = next;
      syncTicker();
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      app.ticker.stop();
      app.destroy(false, { children: true });
      npcPool.forEach((container) => {
        if (!container.destroyed) container.destroy({ children: true });
      });
      npcPool.clear();
      textures.forEach((texture) => texture.destroy());
      textures = [];
      artwork.destroy();
      approved.clear();
      pending.clear();
    },
  };
}

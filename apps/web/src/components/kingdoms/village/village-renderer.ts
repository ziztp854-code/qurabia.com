import { Application, Assets, Container, Graphics, type Texture } from 'pixi.js';
import { villageAssets, type VillageAssetSlot } from '@/lib/kingdoms/village/assetManifest';
import { getBuildingRect, rectCenter } from '@/lib/kingdoms/village/coordinates';
import type { QualitySettings } from '@/lib/kingdoms/village/quality';
import type {
  CameraSnapshot,
  VillageCanvasProps,
  WorldPoint,
  WorldSize,
} from '@/lib/kingdoms/village/types';
import { buildingKeys, type Building } from '@/lib/kingdoms/types';
import {
  createArtworkTextureCache,
  createBuildingLayer,
  createEnvironmentLayer,
  createNPCLayer,
  paintConstruction,
  paintEnvironment,
  paintInteraction,
  type SceneColors,
} from './village-layers';

export type VillageRenderer = {
  camera: (snapshot: CameraSnapshot) => void;
  update: (props: VillageCanvasProps, quality: QualitySettings) => void;
  hover: (building: Building | null) => void;
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
  try {
    source = await Assets.load<Texture>(villageAssets.base.src);
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
  let buildingLayer: Container;
  let npcs: ReturnType<typeof createNPCLayer>;
  let environment: ReturnType<typeof createEnvironmentLayer>;
  const effects = new Graphics();
  const interactions = new Graphics();
  let hovered: Building | null = null;
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
    const buildingSlots: VillageAssetSlot[] = buildingKeys.map((building) => {
      const level =
        process.env.NODE_ENV === 'development' && next.debug?.building === building
          ? (next.debug.buildingLevel ?? next.village.buildings[building])
          : next.village.buildings[building];
      return villageAssets.buildings[building][Math.max(0, Math.min(4, level - 1))];
    });
    const slots: VillageAssetSlot[] = [
      ...buildingSlots,
      ...Object.values(villageAssets.npc),
      ...(nextSettings.environment ? Object.values(villageAssets.environment) : []),
    ];
    const sources = [...new Set(slots.flatMap((slot) => (slot.src ? [slot.src] : [])))];
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
          if (!disposed) approved.set(src, texture);
        } catch {
          /* Missing optional artwork retains the documented original-art fallback. */
        } finally {
          pending.delete(src);
        }
      }),
    );
  };

  const rebuild = () => {
    if (buildingLayer) {
      world.removeChild(buildingLayer, npcs.layer, environment.layer, effects, interactions);
      buildingLayer.destroy({ children: true });
      npcs.layer.destroy({ children: true });
      environment.layer.destroy({ children: true });
    }
    textures.forEach((texture) => texture.destroy());
    textures = [];
    buildingLayer = createBuildingLayer(source, props, textures, approved, artwork);
    npcs = createNPCLayer(source, props, settings, textures, approved, artwork);
    environment = createEnvironmentLayer(source, textures, approved);
    environment.layer.visible = settings.environment;
    world.addChild(buildingLayer, environment.layer, npcs.layer, effects, interactions);
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
    if (props.debug?.npcs !== false) npcs.update(elapsed);
    if (settings.environment) {
      paintEnvironment(environment.glints, elapsed, colors, settings.particles);
      if (environment.flag)
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
        completionUntil = elapsed + 1500;
      }
      const rebuildNeeded =
        next.village !== props.village ||
        next.debug !== props.debug ||
        nextQuality.npcLimit !== settings.npcLimit;
      props = next;
      settings = nextQuality;
      if (rebuildNeeded) rebuild();
      if (rebuildNeeded)
        void loadApprovedAssets(props, settings).then(() => {
          if (!disposed && props === next && approved.size) {
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
      textures.forEach((texture) => texture.destroy());
      textures = [];
      artwork.destroy();
      approved.clear();
      pending.clear();
    },
  };
}

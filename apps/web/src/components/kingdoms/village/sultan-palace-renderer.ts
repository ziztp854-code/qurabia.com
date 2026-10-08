import { Application, Assets, Container, type Texture } from 'pixi.js';
import { gardenAsset, type GardenPlacement } from '@/lib/kingdoms/palace-garden';
import { getCityComposition } from '@/lib/kingdoms/village/city-composition';
import { PALACE_WORLD } from '@/lib/kingdoms/village/palace-scene-layout';
import type { QualitySettings } from '@/lib/kingdoms/village/quality';
import { VillageCamera } from './village-camera';
import { cityLifeAssets, createCityLifeLayer } from './city-life-layer';
import { createCityWaterLayer } from './city-water-layer';
import { createPalaceGardenLayer } from './palace-garden-layer';
import { createPalaceFlagsLayer } from './palace-flags-layer';
import { createPalaceAtmosphereLayer } from './palace-atmosphere-layer';

export async function createSultanPalaceRenderer(canvas: HTMLCanvasElement, host: HTMLElement, camera: VillageCamera, quality: QualitySettings, initialElapsed = 0) {
  const initializedAt = performance.now();
  let ambientReadyAt: number | null = null;
  canvas.dataset.palaceAmbient = 'loading';
  const app = new Application();
  canvas.dataset.palaceFrames = '0';
  canvas.dataset.palaceUpdateMs = '0';
  await app.init({ canvas, width: host.clientWidth, height: host.clientHeight, resolution: quality.dpr,
    // The photographic master is a separate DOM layer. Alpha textures already
    // soften overlay edges; MSAA multiplies the transparent canvas raster cost.
    autoDensity: true, backgroundAlpha: 0, antialias: false, preference: 'webgl', autoStart: false });
  const world = new Container(); world.label = 'sultan-palace-world'; app.stage.addChild(world);
  let disposed = false, motion = true, visible = true, time = initialElapsed, gardenRevision = 0;
  let activeSince: number | null = null, activeTotal = 0;
  let garden: ReturnType<typeof createPalaceGardenLayer> | undefined;
  let water: ReturnType<typeof createCityWaterLayer> | undefined;
  let flags: ReturnType<typeof createPalaceFlagsLayer> | undefined;
  let life: ReturnType<typeof createCityLifeLayer> | undefined;
  const atmosphere = createPalaceAtmosphereLayer(quality); world.addChild(atmosphere.layer);
  const assets = new Map<string, Texture>();
  const render = () => { if (!disposed) app.render(); };
  const unsubscribe = camera.subscribe(snapshot => {
    world.scale.set(snapshot.scale);
    const x = snapshot.viewport.width / 2 - snapshot.x * snapshot.scale;
    const y = snapshot.viewport.height / 2 - snapshot.y * snapshot.scale;
    world.position.set(x, y);
    host.style.setProperty('--palace-camera-transform', `matrix(${snapshot.scale},0,0,${snapshot.scale},${x},${y})`);
    render();
  });
  const sync = () => {
    const running = !disposed && motion && visible && !document.hidden;
    if (running && activeSince === null) activeSince = performance.now();
    else if (!running && activeSince !== null) { activeTotal += performance.now() - activeSince; activeSince = null; }
    canvas.dataset.palaceRunning = String(running);
    if (running) app.ticker.start(); else { app.ticker.stop(); render(); }
  };
  app.ticker.maxFPS = quality.fps;
  let frames = 0, renderTotal = 0;
  const getFrameStats = () => {
    const at = performance.now();
    return { frames, at, activeMs: activeTotal + (activeSince === null ? 0 : at - activeSince), initializedAt, ambientReadyAt };
  };
  type StatsCanvas = HTMLCanvasElement & { getPalaceFrameStats?: typeof getFrameStats };
  Object.defineProperty(canvas, 'getPalaceFrameStats', { configurable: true, value: getFrameStats });
  app.ticker.add(ticker => {
    if (disposed || !motion || !visible || document.hidden) return;
    const started = performance.now(); time += Math.min(100, ticker.deltaMS);
    garden?.update(time); water?.update(time, true); flags?.update(time); life?.update(time, true);
    atmosphere.update(time);
    renderTotal += performance.now() - started; frames++;
    if (frames % 30 === 0) {
      canvas.dataset.palaceFrames = String(frames); canvas.dataset.palaceUpdateMs = (renderTotal / frames).toFixed(3);
    }
  });
  const visibility = () => { if (document.hidden) camera.stop(); sync(); };
  document.addEventListener('visibilitychange', visibility);
  const intersection = new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); if (!visible) camera.stop(); sync(); });
  intersection.observe(host);
  async function load(src: string) {
    const texture = await Assets.load<Texture>(src);
    if (!disposed) assets.set(src, texture);
    return texture;
  }
  async function updateGarden(placements: readonly GardenPlacement[]) {
    const revision = ++gardenRevision;
    await Promise.all(placements.map(placement => load(gardenAsset(placement.itemId, { variation: placement.slotId }))));
    if (disposed || revision !== gardenRevision) return;
    garden?.destroy(); garden = createPalaceGardenLayer(placements, assets, quality.environment);
    world.addChild(garden.layer); garden.update(time); render();
  }
  const ambientReady = (async () => {
    try {
      const horse = quality.mode === 'high' || quality.mode === 'ultra';
      const sources = [cityLifeAssets.guard, ...(horse ? [cityLifeAssets.caravan] : [])];
      await Promise.all(sources.map(load));
      if (disposed) return;
      const city = { ...getCityComposition({ width: 1600, height: 900 }), world: PALACE_WORLD, palms: [], flags: [],
        routes: [
          { kind: 'guard' as const, points: [{ x: 752 / 1670, y: 387 / 942 }, { x: 784 / 1670, y: 387 / 942 }], duration: 30000, offset: 1900, speed: 8, height: 15 },
          { kind: 'guard' as const, points: [{ x: 883 / 1670, y: 387 / 942 }, { x: 915 / 1670, y: 387 / 942 }], duration: 30000, offset: 7100, speed: 8, height: 15 },
          ...(horse ? [{ kind: 'caravan' as const, points: [{ x: 790 / 1670, y: 727 / 942 }, { x: 865 / 1670, y: 727 / 942 }], duration: 40000, offset: 3800, speed: 12, height: 21, pause: 1400 }] : []),
        ] };
      life = createCityLifeLayer(city, assets, { ...quality, environment: false, particles: false, npcLimit: quality.mode === 'low' ? 1 : horse ? 3 : 2 },
        { gold: '#c5a772', light: '#ffffff', water: '#ffffff', dust: '#423520' }, [], time);
      world.addChild(life.layer);
      if (quality.environment) {
        const [mask, plate] = await Promise.all([load('/game-art/kingdoms/city-scenes/palace-user-water-mask.png'), load('/game-art/kingdoms/city-scenes/palace-courtyard-user.webp')]);
        if (disposed) return;
        water = createCityWaterLayer(PALACE_WORLD, mask); world.addChildAt(water.layer, 0);
        flags = createPalaceFlagsLayer(plate); world.addChild(flags.layer);
        water.update(time, true); flags.update(time);
      }
      render();
      ambientReadyAt = performance.now(); canvas.dataset.palaceAmbient = 'ready';
    } catch { canvas.dataset.palaceAmbient = 'unavailable'; }
  })();
  atmosphere.update(time); sync();
  return { updateGarden, ambientReady, getElapsed: () => time, getFrameStats,
    setMotion(value: boolean) { motion = value; if (!value) camera.stop(); sync(); },
    resize(width: number, height: number) { app.renderer.resize(width, height); camera.resize({ width, height }, PALACE_WORLD); render(); },
    destroy() {
      if (disposed) return; disposed = true; gardenRevision++;
      delete (canvas as StatsCanvas).getPalaceFrameStats;
      unsubscribe(); intersection.disconnect(); document.removeEventListener('visibilitychange', visibility);
      app.ticker.stop();
      // Release renderer bind groups before disposing the scene-owned texture sources.
      app.destroy(false, { children: false });
      garden?.destroy(); water?.destroy(); flags?.destroy(); life?.destroy(); atmosphere.destroy();
      world.destroy({ children: true }); assets.clear();
    } };
}

import { Application, Assets, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { farmGrowth, gardenProgress, type FarmState } from '@/lib/kingdoms/sultan-farm';
import {
  farmPlantAsset,
  farmVisualBlend,
  type FarmVisualStage,
  farmWindPose,
} from '@/lib/kingdoms/village/farm-plant-visual';
import { farmBedPoint, FARM_WORLD } from '@/lib/kingdoms/village/farm-scene-layout';
import type { QualitySettings } from '@/lib/kingdoms/village/quality';
import { VillageCamera } from './village-camera';

/** Scene-owned procedural plants; roots stay fixed while only the canopy sways. */
export async function createSultanFarmRenderer(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  camera: VillageCamera,
  quality: QualitySettings,
) {
  const app = new Application();
  await app.init({
    canvas,
    width: host.clientWidth,
    height: host.clientHeight,
    resolution: quality.dpr,
    autoDensity: true,
    backgroundAlpha: 0,
    antialias: false,
    preference: 'webgl',
    autoStart: false,
  });
  const textures = new Map<string, Texture>();
  const textureLoads = new Map<string, Promise<void>>();
  const loadTexture = (crop: Parameters<typeof farmPlantAsset>[0], stage: FarmVisualStage) => {
    const key = `${crop}-${stage}`;
    if (!textureLoads.has(key))
      textureLoads.set(
        key,
        Assets.load<Texture>(farmPlantAsset(crop, stage))
          .then((texture) => {
            textures.set(key, texture);
          })
          .catch(() => {
            textureLoads.delete(key);
          }),
      );
    return textureLoads.get(key)!;
  };
  const world = new Container();
  const style = getComputedStyle(host);
  const token = (name: string) => style.getPropertyValue(name).trim();
  const colors = {
    green: token('--kingdoms-ui-success'),
    red: token('--kingdoms-ui-danger'),
    gold: token('--kingdoms-ui-gold'),
    ivory: token('--brand-ivory'),
    violet: token('--kingdoms-garden-violet'),
  };
  app.stage.addChild(world);
  let disposed = false,
    moving = false,
    visible = true,
    elapsed = 0,
    signature = '',
    updateRevision = 0;
  const canopies: { node: Container; phase: number; strength: number }[] = [];
  const render = () => {
    if (!disposed) app.render();
  };
  const unsubscribe = camera.subscribe((snapshot) => {
    world.scale.set(snapshot.scale);
    world.position.set(
      snapshot.viewport.width / 2 - snapshot.x * snapshot.scale,
      snapshot.viewport.height / 2 - snapshot.y * snapshot.scale,
    );
    render();
  });
  const sync = () => {
    const running = !disposed && moving && visible && !document.hidden && canopies.length > 0;
    canvas.dataset.farmRunning = String(running);
    if (running) app.ticker.start();
    else {
      app.ticker.stop();
      render();
    }
  };
  app.ticker.maxFPS = Math.min(30, quality.fps);
  app.ticker.add((ticker) => {
    elapsed += Math.min(100, ticker.deltaMS);
    for (const { node, phase, strength } of canopies) {
      const pose = farmWindPose(elapsed, phase, strength);
      node.rotation = pose.rotation;
      node.skew.x = pose.skewX;
    }
  });
  const visibility = () => {
    if (document.hidden) camera.stop();
    sync();
  };
  document.addEventListener('visibilitychange', visibility);
  const intersection = new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    if (!visible) camera.stop();
    sync();
  });
  intersection.observe(host);
  async function update(farm: FarmState, now: number) {
    const next =
      gardenProgress(farm).style +
      ':' +
      farm.plots
        .map((p) =>
          p.plant
            ? `${p.version}:${Math.floor(farmGrowth(p.plant, now).progress * 80)}`
            : `${p.version}:empty`,
        )
        .join('|');
    if (signature === next) return;
    signature = next;
    const revision = ++updateRevision;
    const needed = new Map<string, Promise<void>>();
    for (const plot of farm.plots) {
      if (!plot.plant) continue;
      const growth = farmGrowth(plot.plant, now);
      if (growth.stage === 'seed') continue;
      const weights = farmVisualBlend(growth.progress);
      for (const [stage, alpha] of Object.entries(weights) as [FarmVisualStage, number][])
        if (alpha > 0)
          needed.set(`${plot.plant.crop}-${stage}`, loadTexture(plot.plant.crop, stage));
    }
    await Promise.all(needed.values());
    if (disposed || revision !== updateRevision) return;
    if ([...needed.keys()].some((key) => !textures.has(key))) signature = '';
    for (const child of world.removeChildren()) child.destroy({ children: true });
    canopies.length = 0;
    // Back beds first, front beds last: consistent photographic occlusion.
    const ordered = farm.plots
      .map((plot, id) => ({ plot, id, y: farmBedPoint(id).y }))
      .sort((a, b) => a.y - b.y);
    for (const { plot, id } of ordered) {
      const decoration = gardenProgress(farm).style;
      if (decoration !== 'natural') {
        const corners = [
          [0.08, 0.08],
          [0.92, 0.08],
          [0.92, 0.92],
          [0.08, 0.92],
        ];
        const border = new Graphics();
        corners.forEach(([u, v], index) => {
          const point = farmBedPoint(id, u, v);
          if (index === 0) border.moveTo(point.x, point.y);
          else border.lineTo(point.x, point.y);
        });
        border.closePath().stroke({ color: colors[decoration], width: 3, alpha: 0.85 });
        world.addChild(border);
      }
      const plant = plot.plant;
      if (!plant) continue;
      const growth = farmGrowth(plant, now),
        progress = growth.progress;
      const density =
        quality.mode === 'low'
          ? 2
          : ['pomegranate', 'sunflower', 'lotus'].includes(plant.crop)
            ? 2
            : plant.crop === 'beans'
              ? 3
              : 4;
      const rows = plant.crop === 'wheat' && quality.mode !== 'low' ? 3 : 2;
      for (let row = 0; row < rows; row++)
        for (let col = 0; col < density; col++) {
          const root = farmBedPoint(
            id,
            0.18 + (0.64 * (col + 0.5)) / density,
            0.18 + (0.64 * (row + 0.5)) / rows,
          );
          const shadow = new Graphics()
            .ellipse(root.x + 7, root.y + 3, plant.crop === 'pomegranate' ? 23 : 12, 4)
            .fill({ color: 0x241c13, alpha: 0.23 });
          world.addChild(shadow);
          if (growth.stage === 'seed') {
            world.addChild(new Graphics().ellipse(root.x, root.y, 3, 1.5).fill(0xbba068));
            continue;
          }
          const canopy = new Container();
          canopy.position.set(root.x, root.y);
          world.addChild(canopy);
          const matureHeight = {
            wheat: 62,
            beans: 58,
            pomegranate: 92,
            rose: 64,
            mint: 45,
            jasmine: 58,
            lavender: 56,
            sunflower: 82,
            iris: 62,
            lotus: 54,
          }[plant.crop];
          const height = matureHeight * (0.24 + 0.76 * progress);
          const weights = farmVisualBlend(progress);
          let rendered = false;
          for (const [stage, alpha] of Object.entries(weights) as [FarmVisualStage, number][]) {
            if (alpha <= 0) continue;
            const texture = textures.get(`${plant.crop}-${stage}`);
            if (!texture) continue;
            const sprite = new Sprite(texture);
            sprite.anchor.set(0.5, 0.97);
            sprite.height = height;
            sprite.scale.x = sprite.scale.y;
            sprite.alpha = alpha;
            canopy.addChild(sprite);
            rendered = true;
          }
          if (!rendered)
            canopy.addChild(
              new Graphics().ellipse(0, -2, 3, 1.5).fill({ color: 0xbba068, alpha: 0.8 }),
            );
          const windStrength = ['wheat', 'lavender', 'sunflower'].includes(plant.crop)
            ? 1
            : ['pomegranate', 'rose', 'jasmine'].includes(plant.crop)
              ? 0.55
              : 0.75;
          canopies.push({
            node: canopy,
            phase: row * 2 + col * 0.7 + id * 0.31,
            strength: windStrength,
          });
        }
    }
    render();
    sync();
  }
  return {
    update,
    setMotion(value: boolean) {
      moving = value && quality.mode !== 'low';
      sync();
    },
    resize(width: number, height: number) {
      app.renderer.resize(width, height);
      camera.resize({ width, height }, FARM_WORLD);
      render();
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      intersection.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      app.ticker.stop();
      app.destroy(false, { children: true });
      canopies.length = 0;
      textures.clear();
    },
  };
}

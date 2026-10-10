import { Application, Assets, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { farmCrops, farmGrowth, gardenProgress, type FarmState } from '@/lib/kingdoms/sultan-farm';
import { farmPlantShapes } from '@/lib/kingdoms/village/farm-plant-shapes';
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
  try {
    await Promise.all(
      ['wheat', 'beans', 'pomegranate'].flatMap((crop) =>
        ['young', 'flowering', 'ripe'].map(async (stage) => {
          const key = `${crop}-${stage}`;
          textures.set(
            key,
            await Assets.load<Texture>(
              `/game-art/kingdoms/city-scenes/sultan-farm-plants/${key}.webp`,
            ),
          );
        }),
      ),
    );
  } catch (error) {
    app.destroy(false, { children: true });
    throw error;
  }
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
    signature = '';
  const canopies: { node: Container; phase: number }[] = [];
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
    for (const { node, phase } of canopies)
      node.rotation = Math.sin(elapsed / 2800 + phase) * 0.009;
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
  function update(farm: FarmState, now: number) {
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
        plant.crop === 'pomegranate' ? 2 : plant.crop === 'beans' || quality.mode === 'low' ? 3 : 5;
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
          if (!['wheat', 'beans', 'pomegranate'].includes(plant.crop)) {
            const botanical = new Container();
            botanical.scale.set(0.35 + 0.65 * progress);
            canopy.addChild(botanical);
            for (const shape of farmPlantShapes(plant.crop, progress)) {
              const art = new Graphics();
              const paint =
                shape.paint === 'leaf'
                  ? colors.green
                  : shape.paint === 'center'
                    ? colors.gold
                    : colors[farmCrops[plant.crop].color];
              if (shape.kind === 'line')
                art
                  .moveTo(shape.x1, shape.y1)
                  .lineTo(shape.x2, shape.y2)
                  .stroke({ color: paint, width: 2 });
              else {
                art.ellipse(0, 0, shape.rx, shape.ry).fill(paint);
                art.position.set(shape.x, shape.y);
                art.rotation = (shape.angle * Math.PI) / 180;
              }
              botanical.addChild(art);
            }
            canopies.push({ node: canopy, phase: row * 2 + col * 0.7 + id });
            continue;
          }
          const height =
            (plant.crop === 'pomegranate' ? 91 : plant.crop === 'wheat' ? 60 : 49) *
            (0.17 + 0.83 * progress);
          const flowering = Math.min(1, Math.max(0, (progress - 0.3) / 0.15));
          const ripe = Math.min(1, Math.max(0, (progress - 0.75) / 0.25));
          const weights = { young: 1 - flowering, flowering: flowering * (1 - ripe), ripe };
          for (const [stage, alpha] of Object.entries(weights)) {
            if (alpha <= 0) continue;
            const sprite = new Sprite(textures.get(`${plant.crop}-${stage}`));
            sprite.anchor.set(0.5, 0.97);
            sprite.height = height;
            sprite.scale.x = sprite.scale.y;
            sprite.alpha = alpha;
            canopy.addChild(sprite);
          }
          canopies.push({ node: canopy, phase: row * 2 + col * 0.7 + id });
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

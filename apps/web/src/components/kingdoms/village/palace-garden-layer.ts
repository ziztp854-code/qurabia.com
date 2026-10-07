import { Container, Graphics, MeshPlane, Sprite, type Texture } from 'pixi.js';
import { gardenAsset, type GardenPlacement } from '@/lib/kingdoms/palace-garden';
import { gardenColorTexture } from './garden-color-texture';
import { getGardenProjection } from '@/lib/kingdoms/village/garden-projection';
import { PALACE_WORLD } from '@/lib/kingdoms/village/palace-scene-layout';

export function createPalaceGardenLayer(garden: readonly GardenPlacement[], assets: ReadonlyMap<string, Texture>, leaves: boolean) {
  const layer = new Container(); layer.label = 'palace-garden'; layer.sortableChildren = true;
  const meshes: { mesh: MeshPlane; base: Float32Array; phase: number; amplitude: number }[] = [];
  const owned: Texture[] = [];
  const geometries: MeshPlane['geometry'][] = [];
  const fountains: { drops: Graphics; phase: number }[] = [];
  for (const placement of garden) {
    const source = assets.get(gardenAsset(placement.itemId, { variation: placement.slotId }));
    if (!source) continue;
    const colored = placement.color ? gardenColorTexture(source, placement.color, placement.itemId) : null;
    if (colored) owned.push(colored);
    const texture = colored ?? source;
    const projection = getGardenProjection(placement.itemId, placement.slotId);
    const flowerBed = ['roses', 'flowers', 'tulips', 'jasmine'].some(kind => placement.itemId.includes(kind));
    const offsets = !flowerBed ? [[0, 0]] : placement.slotId < 8 ? [[-10,-3],[11,-2],[0,5]] :
      [[-44,-15],[0,-17],[43,-13],[-57,8],[-19,11],[20,9],[56,13]];
    const scale = flowerBed ? .65 : 1;
    for (const [sample, [offsetX, offsetY]] of offsets.entries()) {
    const width = projection.width * PALACE_WORLD.width * scale, height = projection.height * PALACE_WORLD.height * scale;
    const x = projection.x * PALACE_WORLD.width + offsetX, y = projection.y * PALACE_WORLD.height + offsetY;
    const shadow = new Graphics().ellipse(0, 0, projection.shadowWidth * 835 * scale, projection.shadowHeight * 471 * scale)
      .fill({ color: 0x241c12, alpha: .15 });
    shadow.position.set(x, y); shadow.zIndex = y - .01; layer.addChild(shadow);
    const vegetation = ['roses', 'flowers', 'tulips', 'jasmine', 'shrub', 'tree'].some(kind => placement.itemId.includes(kind));
    if (leaves && vegetation) {
      const mesh = new MeshPlane({ texture, verticesX: 3, verticesY: 5 });
      geometries.push(mesh.geometry);
      mesh.scale.set(width / texture.width, height / texture.height);
      mesh.position.set(x - width * projection.anchorX, y - height * projection.anchorY);
      mesh.zIndex = y;
      const buffer = mesh.geometry.getAttribute('aPosition').buffer;
      meshes.push({ mesh, base: new Float32Array(buffer.data as Float32Array), phase: placement.slotId * 1.79 + sample * .83,
        amplitude: placement.itemId === 'cypress-tree' ? .45 : .3 });
      layer.addChild(mesh);
    } else {
      const sprite = new Sprite(texture); sprite.anchor.set(projection.anchorX, projection.anchorY);
      sprite.width = width; sprite.height = height; sprite.position.set(x, y); sprite.zIndex = y;
      layer.addChild(sprite);
    }
    if (leaves && placement.itemId === 'fountain') {
      const drops = new Graphics();
      drops.position.set(x - width * projection.anchorX, y - height * projection.anchorY);
      drops.scale.set(width / texture.width, height / texture.height); drops.zIndex = y + .01;
      layer.addChild(drops); fountains.push({ drops, phase: placement.slotId * .197 });
    }
    }
  }
  return { layer, update(time: number) {
    for (const { mesh, base, phase, amplitude } of meshes) {
      const buffer = mesh.geometry.getAttribute('aPosition').buffer;
      const positions = buffer.data as Float32Array;
      for (let index = 0; index < positions.length; index += 2) {
        // Root and soil remain fixed; only the top part of alpha foliage flexes.
        const tip = Math.max(0, 1 - base[index + 1] / (mesh.texture.height * .72));
        positions[index] = base[index] + Math.sin(time / 2100 + phase + base[index + 1] / 170) * tip * tip * amplitude / mesh.scale.x;
      }
      buffer.update();
    }
    for (const { drops, phase } of fountains) {
      drops.clear();
      // Registered to the existing fountain's three streams, above its fixed stone basin.
      for (let index = 0; index < 9; index++) {
        const progress = (time / 1700 + phase + index * .173) % 1;
        const stream = index % 3, startX = [170, 255, 336][stream], endX = [185, 256, 350][stream];
        drops.circle(startX + (endX - startX) * progress, 150 + 130 * progress * progress, 1.6)
          .fill({ color: 0xe3f2ec, alpha: Math.sin(progress * Math.PI) * .28 });
      }
    }
  }, destroy() { layer.destroy({ children: true }); geometries.forEach(geometry => geometry.destroy()); owned.forEach(texture => texture.destroy(true)); } };
}

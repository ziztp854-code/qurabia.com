import { Container, Sprite, Texture, TilingSprite } from 'pixi.js';
import type { WorldSize } from '@/lib/kingdoms/village/types';

/** Two drifting passes share a tiny immutable ripple atlas. The original
 * terrain never moves; only the authored water alpha mask receives highlights. */
function rippleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 384; canvas.height = 160;
  const context = canvas.getContext('2d');
  if (!context) return null;
  let seed = 4217;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let index = 0; index < 100; index++) {
    const x = random() * canvas.width, y = random() * canvas.height;
    const length = 7 + random() * 25;
    const gradient = context.createLinearGradient(x, y, x + length, y);
    gradient.addColorStop(0, 'rgba(192,224,221,0)');
    gradient.addColorStop(.35, `rgba(192,224,221,${.13 + random() * .23})`);
    gradient.addColorStop(1, 'rgba(192,224,221,0)');
    context.strokeStyle = gradient;
    context.lineWidth = .55 + random() * .7;
    context.beginPath(); context.moveTo(x, y);
    context.quadraticCurveTo(x + length * .5, y - 1.5 - random() * 2, x + length, y);
    context.stroke();
  }
  return Texture.from(canvas);
}

export function createCityWaterLayer(world: WorldSize, maskTexture: Texture) {
  const layer = new Container();
  layer.label = 'city-water'; layer.eventMode = 'none';
  const texture = rippleTexture();
  const mask = new Sprite(maskTexture);
  mask.width = world.width; mask.height = world.height;
  const passes = texture ? [0, 1].map(index => {
    const sprite = new TilingSprite({ texture, width: world.width, height: world.height });
    sprite.tileScale.set(index === 0 ? .8 : .57, index === 0 ? .56 : .43);
    sprite.alpha = index === 0 ? .45 : .3;
    layer.addChild(sprite);
    return sprite;
  }) : [];
  layer.addChild(mask); layer.mask = mask;
  let time = 0;
  return {
    layer,
    update(elapsed: number, animate: boolean) {
      if (animate) time = elapsed / 1000;
      passes.forEach((sprite, index) => {
        const direction = index === 0 ? 1 : -.36;
        sprite.tilePosition.set(time * 3.1 * direction + index * 113, time * .48 + index * 49);
      });
    },
    destroy() { layer.destroy({ children: true }); texture?.destroy(true); },
  };
}

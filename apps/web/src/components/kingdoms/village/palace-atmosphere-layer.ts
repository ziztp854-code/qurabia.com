import { Container, Graphics } from 'pixi.js';
import type { QualitySettings } from '@/lib/kingdoms/village/quality';

/** Small highlights live over existing jets/lamps; no blurred screen bloom. */
export function createPalaceAtmosphereLayer(quality: QualitySettings) {
  const layer = new Container(); layer.label = 'palace-fountains-atmosphere'; layer.eventMode = 'none';
  const water = new Graphics(), air = new Graphics(), lights = new Graphics();
  layer.addChild(water, air, lights);
  return { layer, update(elapsed: number) {
    const time = elapsed / 1000;
    water.clear(); air.clear(); lights.clear();
    if (quality.environment) {
      const jets = [[834,416,20],[834,463,24],[834,516,39],[834,581,31],[155,491,43],[108,526,24],[377,509,16],[1295,509,16],[1549,514,36],[1271,443,16],[235,437,17]];
      jets.forEach(([rootX,rootY,height], jet) => {
        for (let index = 0; index < 4; index++) {
          const phase = (time * .34 + index * .243 + jet * .181) % 1;
          const side = index % 2 === 0 ? 1 : -1;
          water.circle(rootX + side * (2 + index * 2) * phase, rootY - height * Math.sin(phase * Math.PI), .5 + phase * .25)
            .fill({ color: 0xe4f1ee, alpha: Math.sin(phase * Math.PI) * .22 });
        }
      });
      water.ellipse(834, 516, 15 + time % 2 * 5, 3 + time % 2).stroke({ color: 0xdbece5, alpha: .09 * (1 - time % 2 / 2), width: .7 });
      [[737,291],[921,291],[794,302],[878,302],[716,362],[951,362]].forEach(([x,y],index) => {
        const flameHeight = 2 + .35 * Math.sin(time * 5.1 + index * 1.9) + .15 * Math.sin(time * 8.7);
        lights.ellipse(x, y, 3.5, 5).fill({ color: 0xf6c67e, alpha: .045 + .018 * Math.sin(time * 1.7 + index * 2.1) });
        lights.ellipse(x, y - flameHeight / 2, .7, flameHeight).fill({ color: 0xffd28b, alpha: .26 });
      });
    }
    if (quality.particles && quality.mode !== 'medium') {
      for (let index = 0; index < 3; index++) {
        const phase = (time / 39 + index * .32) % 1;
        const x = 220 + phase * 510, y = 82 + index * 16 + Math.sin(time / 5 + index) * 3;
        const wing = 1.1 + Math.sin(time * 5 + index * 2) * .6;
        air.moveTo(x - 2, y - wing).lineTo(x, y).lineTo(x + 2, y - wing).stroke({ color: 0x514d42, width: .7, alpha: .3 });
      }
      for (let index = 0; index < 5; index++) {
        const phase = (time / 19 + index * .197) % 1;
        air.circle(790 + index * 22 + phase * 5, 320 - phase * 15, .65).fill({ color: 0xdac9a5, alpha: Math.sin(phase * Math.PI) * .11 });
      }
    }
  }, destroy() { layer.destroy({ children: true }); } };
}

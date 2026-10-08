import { Container, MeshPlane, Texture } from 'pixi.js';

export function createPalaceFlagsLayer(plate: Texture) {
  const layer = new Container(); layer.label = 'palace-flags'; layer.eventMode = 'none';
  const owned: Texture[] = [];
  const flags = [
    { x: 695, y: 194, width: 47, height: 96, points: [2, 2, 44, 2, 43, 78, 24, 93, 2, 79], pennant: false },
    { x: 932, y: 194, width: 44, height: 96, points: [2, 2, 42, 2, 41, 78, 23, 93, 2, 78], pennant: false },
    { x: 466, y: 44, width: 22, height: 24, points: [1, 1, 20, 11, 4, 21, 1, 19], pennant: true },
    { x: 649, y: 96, width: 21, height: 25, points: [1, 1, 19, 10, 4, 23, 1, 21], pennant: true },
    { x: 1029, y: 99, width: 23, height: 24, points: [1, 1, 21, 9, 4, 22, 1, 20], pennant: true },
  ].flatMap((spec, index) => {
    const canvas = document.createElement('canvas'); canvas.width = spec.width; canvas.height = spec.height;
    const context = canvas.getContext('2d'); if (!context) return [];
    context.beginPath(); context.moveTo(spec.points[0], spec.points[1]);
    for (let point = 2; point < spec.points.length; point += 2) context.lineTo(spec.points[point], spec.points[point + 1]);
    context.closePath(); context.clip();
    const source = plate.source.resource as CanvasImageSource;
    context.drawImage(source, spec.x, spec.y, spec.width, spec.height, 0, 0, spec.width, spec.height);
    const texture = Texture.from(canvas); owned.push(texture);
    const mesh = new MeshPlane({ texture, verticesX: 5, verticesY: 9 }); mesh.position.set(spec.x, spec.y);
    const base = new Float32Array(mesh.geometry.getAttribute('aPosition').buffer.data as Float32Array);
    layer.addChild(mesh); return [{ mesh, base, index, width: spec.width, height: spec.height, pennant: spec.pennant }];
  });
  return { layer, update(time: number) {
    for (const flag of flags) {
      const buffer = flag.mesh.geometry.getAttribute('aPosition').buffer, positions = buffer.data as Float32Array;
      for (let index = 0; index < positions.length; index += 2) {
        const x = flag.base[index], y = flag.base[index + 1];
        // The suspension edge and central heraldry remain registered.
        const edge = Math.abs(x / flag.width - .5) * 2;
        const tip = Math.max(0, (y / flag.height - .8) / .2);
        const flex = flag.pennant ? (x / flag.width) ** 2 : (edge * edge * .28 + tip * tip) * y / flag.height;
        positions[index] = x + Math.sin(time / 1900 + flag.index * 2.3 + y / 44) * .36 * flex;
        positions[index + 1] = y + (flag.pennant ? Math.sin(time / 1400 + flag.index * 1.8 + x / 9) * .55 * flex : 0);
      }
      buffer.update();
    }
  }, destroy() { const geometries = flags.map(flag => flag.mesh.geometry); layer.destroy({ children: true }); geometries.forEach(geometry => geometry.destroy()); owned.forEach(texture => texture.destroy(true)); } };
}

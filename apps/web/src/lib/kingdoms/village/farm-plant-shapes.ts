import { farmCrops, type CropKey } from '../sultan-farm';

export type PlantShape =
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; paint: 'leaf' }
  | {
      kind: 'ellipse';
      x: number;
      y: number;
      rx: number;
      ry: number;
      angle: number;
      paint: 'leaf' | 'bloom' | 'center';
    };
/** Small shared botanical silhouettes for SVG controls and the Pixi scene. No raster downloads. */
export function farmPlantShapes(crop: CropKey, progress: number): PlantShape[] {
  const form = farmCrops[crop].form;
  const shapes: PlantShape[] = [];
  const stem = (x: number, top: number) =>
    shapes.push({ kind: 'line', x1: 0, y1: 0, x2: x, y2: top, paint: 'leaf' });
  const oval = (
    x: number,
    y: number,
    rx: number,
    ry: number,
    paint: 'leaf' | 'bloom' | 'center',
    angle = 0,
  ) => shapes.push({ kind: 'ellipse', x, y, rx, ry, angle, paint });
  stem(0, -55);
  const leaves = form === 'herb' ? 4 : 2;
  for (let i = 0; i < leaves; i++) {
    oval(-9, -14 - i * 9, form === 'herb' ? 10 : 9, 4, 'leaf', 25);
    oval(9, -19 - i * 9, 9, 4, 'leaf', -25);
  }
  if (progress < 0.35) return shapes;
  if (form === 'grain') {
    for (let i = 0; i < 5; i++) {
      oval(-4, -46 - i * 4, 5, 2, 'bloom', 30);
      oval(4, -46 - i * 4, 5, 2, 'bloom', -30);
    }
  } else if (form === 'spike') {
    for (const x of [-12, 0, 12]) {
      stem(x, -57);
      for (let i = 0; i < 5; i++) oval(x, -40 - i * 4, 4, 3, progress >= 0.75 ? 'bloom' : 'leaf');
    }
  } else if (form === 'tree') {
    oval(0, -44, 23, 19, 'leaf');
    oval(-14, -34, 15, 13, 'leaf');
    oval(15, -39, 15, 14, 'leaf');
    if (progress >= 0.75)
      for (const [x, y] of [
        [-15, -40],
        [13, -50],
        [7, -31],
      ])
        oval(x, y, 5, 5, 'bloom');
  } else if (form === 'pods') {
    if (progress >= 0.75) {
      oval(-13, -31, 3, 11, 'leaf', 15);
      oval(13, -43, 3, 10, 'leaf', -15);
    }
  } else if (form !== 'herb' && progress >= 0.75) {
    const petals = form === 'sun' ? 12 : form === 'star' ? 5 : form === 'iris' ? 3 : 7;
    for (let i = 0; i < petals; i++) {
      const angle = (i * 360) / petals,
        rad = (angle * Math.PI) / 180;
      const radius = form === 'iris' ? 9 : form === 'sun' ? 10 : 7;
      oval(
        Math.sin(rad) * radius,
        -55 + Math.cos(rad) * radius,
        form === 'iris' ? 5 : 4,
        form === 'iris' ? 13 : form === 'sun' ? 8 : 6,
        'bloom',
        -angle,
      );
    }
    oval(0, -55, form === 'sun' ? 7 : 3, form === 'sun' ? 7 : 3, 'center');
  }
  return shapes;
}

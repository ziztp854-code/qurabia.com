// Explicit offline preparation only. Never called from application requests or installation.
import fs from 'node:fs';
import crypto from 'node:crypto';

const [inputDirectory, outputFile] = process.argv.slice(2);
if (!inputDirectory || !outputFile)
  throw new Error(
    'Usage: node prepare-abandoned-preview-geography.mjs <input-directory> <output-json>',
  );
const bounds = { west: 24, south: 12, east: 61, north: 38.5 };
const countries = {
  EGY: 'egypt',
  SYR: 'levant',
  LBN: 'levant',
  JOR: 'levant',
  ISR: 'levant',
  PSX: 'levant',
  IRQ: 'iraq',
  SAU: 'arabia',
  YEM: 'arabia',
  OMN: 'arabia',
  ARE: 'arabia',
  KWT: 'arabia',
  QAT: 'arabia',
  BHR: 'arabia',
};
const raw = (name) => fs.readFileSync(`${inputDirectory}/${name}`);
const files = ['ne_10m_land.geojson', 'ne_10m_lakes.geojson', 'ne_10m_admin_0_countries.geojson'];
const sources = files.map((file) => ({
  file,
  url: `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/${file}`,
  sha256: crypto.createHash('sha256').update(raw(file)).digest('hex'),
}));
const read = (file) => JSON.parse(raw(file));
function clip(ring) {
  let points = ring.slice(0, -1).map(([x, y]) => [x, y]);
  for (const [axis, limit, direction] of [
    [0, bounds.west, 1],
    [0, bounds.east, -1],
    [1, bounds.south, 1],
    [1, bounds.north, -1],
  ]) {
    const result = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i],
        b = points[(i + 1) % points.length];
      const insideA = direction * (a[axis] - limit) >= 0,
        insideB = direction * (b[axis] - limit) >= 0;
      if (insideA) result.push(a);
      if (insideA !== insideB) {
        const t = (limit - a[axis]) / (b[axis] - a[axis]);
        result.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      }
    }
    points = result;
  }
  if (points.length < 3) return null;
  const rounded = points.map((point) => point.map((v) => Number(v.toFixed(6))));
  rounded.push([...rounded[0]]);
  return rounded;
}
function polygons(geometry) {
  const input = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return input.flatMap((polygon) => {
    const outer = clip(polygon[0]);
    if (!outer) return [];
    return [[outer, ...polygon.slice(1).map(clip).filter(Boolean)]];
  });
}
const countryMasks = read(files[2])
  .features.filter((f) => Object.hasOwn(countries, f.properties.ADM0_A3))
  .map((f) => ({
    code: f.properties.ADM0_A3,
    name: f.properties.ADMIN,
    region: countries[f.properties.ADM0_A3],
    polygons: polygons(f.geometry),
  }));
if (countryMasks.length !== Object.keys(countries).length)
  throw new Error('Incomplete preview country coverage');
const result = {
  version: 'natural-earth-10m-middle-east-preview-v1',
  bounds,
  sources,
  countries: countryMasks,
  land: read(files[0]).features.flatMap((f) => polygons(f.geometry)),
  water: read(files[1]).features.flatMap((f) => polygons(f.geometry)),
};
fs.writeFileSync(outputFile, `${JSON.stringify(result)}\n`);
console.log(
  JSON.stringify({
    outputFile,
    bytes: fs.statSync(outputFile).size,
    countries: countryMasks.length,
    landPolygons: result.land.length,
    waterPolygons: result.water.length,
    sources,
  }),
);

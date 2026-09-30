import type { Geometry, Position, Feature, FeatureCollection, JsonValue } from './geojson';
import type { BoundingBox } from './models';
import type { MapLayers, MapPayload } from './presentation';
import { freezeDto } from './immutable';

type RecordValue = Record<string, unknown>;
type Rule = (value: unknown) => boolean;
const id: Rule = (v) => typeof v === 'string' && v.trim().length > 0 && v.length <= 128;
const nullableId: Rule = (v) => v === null || id(v);
const text: Rule = (v) => typeof v === 'string' && v.trim().length > 0 && v.length <= 256;
const numeric: Rule = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const integer: Rule = (v) => numeric(v) && Number.isSafeInteger(v);
const oneOf =
  (...values: readonly unknown[]): Rule =>
  (v) =>
    values.includes(v);
const cityRules = {
  kind: oneOf('city'),
  name: text,
  regionId: id,
  ownerPlayerId: nullableId,
  ownerSultanateId: nullableId,
  fortificationLevel: integer,
  strategicValue: numeric,
};
const layerRules: Record<keyof MapLayers, Record<string, Rule>> = {
  cities: cityRules,
  castles: { ...cityRules, kind: oneOf('castle'), cityId: nullableId },
  territories: { regionId: id, ownerPlayerId: nullableId, ownerSultanateId: nullableId },
  sultanateBorders: { sultanateId: id },
  armies: {
    armyId: id,
    ownerPlayerId: nullableId,
    ownerSultanateId: nullableId,
    status: oneOf('stationed', 'moving', 'besieging', 'retreating'),
    own: oneOf(true, false),
  },
  armyRoutes: { armyId: id, distance: numeric, departureTime: integer, arrivalTime: integer },
  sieges: {
    targetId: id,
    targetKind: oneOf('city', 'castle'),
    status: oneOf('preparing', 'active', 'resolved'),
  },
  visibility: { kind: oneOf('territory', 'watchtower', 'scouting', 'alliance') },
  fog: { kind: oneOf('fog') },
};

function invalid(): never {
  throw new TypeError('Invalid map payload');
}
function record(value: unknown, keys: readonly string[]): RecordValue {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const object = value as RecordValue;
  if (Object.keys(object).length !== keys.length || keys.some((key) => !Object.hasOwn(object, key)))
    return invalid();
  return object;
}
function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return invalid();
  return value;
}
function position(value: unknown, budget: DecodeBudget): Position {
  if (!Array.isArray(value) || value.length !== 2 || ++budget.vertices > 100000) return invalid();
  const longitude = number(value[0]),
    latitude = number(value[1]);
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return invalid();
  return [longitude, latitude];
}
function positions(value: unknown, min: number, budget: DecodeBudget): readonly Position[] {
  if (!Array.isArray(value) || value.length < min || value.length > 100000) return invalid();
  return value.map((point) => position(point, budget));
}
function polygon(value: unknown, budget: DecodeBudget): readonly (readonly Position[])[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 1000) return invalid();
  return value.map((ring) => {
    const points = positions(ring, 4, budget);
    const first = points[0]!,
      last = points[points.length - 1]!;
    if (first[0] !== last[0] || first[1] !== last[1]) return invalid();
    return points;
  });
}
interface DecodeBudget {
  vertices: number;
  features: number;
}
function geometry(value: unknown, budget: DecodeBudget): Geometry {
  const shape = record(value, ['type', 'coordinates']);
  switch (shape.type) {
    case 'Point':
      return { type: 'Point', coordinates: position(shape.coordinates, budget) };
    case 'LineString':
      return { type: 'LineString', coordinates: positions(shape.coordinates, 2, budget) };
    case 'Polygon':
      return { type: 'Polygon', coordinates: polygon(shape.coordinates, budget) };
    case 'MultiLineString': {
      if (
        !Array.isArray(shape.coordinates) ||
        shape.coordinates.length === 0 ||
        shape.coordinates.length > 10000
      )
        return invalid();
      return {
        type: 'MultiLineString',
        coordinates: shape.coordinates.map((line) => positions(line, 2, budget)),
      };
    }
    case 'MultiPolygon': {
      if (
        !Array.isArray(shape.coordinates) ||
        shape.coordinates.length === 0 ||
        shape.coordinates.length > 1000
      )
        return invalid();
      return {
        type: 'MultiPolygon',
        coordinates: shape.coordinates.map((part) => polygon(part, budget)),
      };
    }
    default:
      return invalid();
  }
}

function decodeFeature(value: unknown, layer: keyof MapLayers, budget: DecodeBudget): Feature {
  const feature = record(value, ['type', 'id', 'geometry', 'properties']);
  if (feature.type !== 'Feature' || !id(feature.id) || ++budget.features > 8192) return invalid();
  const rules = layerRules[layer];
  const fields = record(feature.properties, Object.keys(rules));
  if (Object.entries(rules).some(([key, rule]) => !rule(fields[key]))) return invalid();
  if (layer === 'armyRoutes' && number(fields.arrivalTime) <= number(fields.departureTime))
    return invalid();
  const shape = geometry(feature.geometry, budget);
  const pointLayer = ['cities', 'castles', 'armies', 'sieges'].includes(layer);
  const lineLayer = layer === 'armyRoutes';
  if (
    pointLayer
      ? shape.type !== 'Point'
      : lineLayer
        ? !['LineString', 'MultiLineString'].includes(shape.type)
        : !['Polygon', 'MultiPolygon'].includes(shape.type)
  )
    return invalid();
  return {
    type: 'Feature',
    id: feature.id as string,
    geometry: shape,
    properties: { ...fields } as Record<string, JsonValue>,
  };
}
function decodeCollection(
  value: unknown,
  layer: keyof MapLayers,
  budget: DecodeBudget,
): FeatureCollection {
  const data = record(value, ['type', 'features']);
  if (
    data.type !== 'FeatureCollection' ||
    !Array.isArray(data.features) ||
    data.features.length > 8192
  )
    return invalid();
  const features = data.features.map((feature) => decodeFeature(feature, layer, budget));
  if (new Set(features.map((feature) => feature.id)).size !== features.length) return invalid();
  return { type: 'FeatureCollection', features };
}
function decodeBounds(value: unknown): BoundingBox {
  const fields = record(value, ['west', 'south', 'east', 'north']);
  const bounds = {
    west: number(fields.west),
    south: number(fields.south),
    east: number(fields.east),
    north: number(fields.north),
  };
  if (
    bounds.west < -180 ||
    bounds.west > 180 ||
    bounds.east < -180 ||
    bounds.east > 180 ||
    bounds.south < -90 ||
    bounds.north > 90 ||
    bounds.south >= bounds.north ||
    bounds.west === bounds.east ||
    (bounds.west === 180 && bounds.east === -180)
  )
    return invalid();
  return bounds;
}

/** Transport validation only: does not determine ownership, vision, position, travel or siege state. */
export function parseMapPayload(input: unknown): MapPayload {
  const value = record(input, [
    'schemaVersion',
    'worldId',
    'revision',
    'serverTime',
    'expiresAt',
    'bounds',
    'layers',
  ]);
  if (
    value.schemaVersion !== 1 ||
    !id(value.worldId) ||
    typeof value.revision !== 'string' ||
    !/^(0|[1-9]\d{0,79})$/.test(value.revision) ||
    !integer(value.serverTime) ||
    !integer(value.expiresAt)
  )
    return invalid();
  const serverTime = number(value.serverTime),
    expiresAt = number(value.expiresAt);
  if (expiresAt <= serverTime) return invalid();
  const layers = record(value.layers, Object.keys(layerRules));
  const budget = { vertices: 0, features: 0 };
  const decoded = Object.fromEntries(
    Object.keys(layerRules).map((key) => [
      key,
      decodeCollection(layers[key], key as keyof MapLayers, budget),
    ]),
  ) as unknown as MapLayers;
  return freezeDto({
    schemaVersion: 1 as const,
    worldId: value.worldId as string,
    revision: value.revision,
    serverTime,
    expiresAt,
    bounds: decodeBounds(value.bounds),
    layers: decoded,
  });
}

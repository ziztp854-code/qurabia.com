import type { Feature, FeatureCollection, MapPayload, Position } from '@mamluk/world-map-core';
import type { MapPalette } from './styles';

export const ARMY_MISSION_LABELS: Readonly<Record<string, string>> = {
  attack: 'هجوم',
  raid: 'غارة',
  reinforce: 'دعم',
  scout: 'استطلاع',
  gather: 'جمع',
  transport: 'نقل',
  return: 'عودة',
  settle: 'تأسيس',
  occupy: 'احتلال',
  intercept: 'اعتراض',
};
const symbols: Readonly<Record<string, string>> = {
  attack: '×',
  raid: '»',
  reinforce: '+',
  scout: '◇',
  gather: '◆',
  transport: '□',
  return: '<',
  settle: '△',
  occupy: '△',
  intercept: '×',
};
const wrap = (longitude: number) => ((longitude + 540) % 360) - 180;
const deltaLongitude = (from: number, to: number) => wrap(to - from);

export function armyMissionColor(mission: unknown, palette: MapPalette): string {
  if (['attack', 'raid', 'intercept'].includes(String(mission))) return palette.siege;
  if (mission === 'scout') return palette.castle;
  if (['gather', 'transport', 'settle', 'occupy'].includes(String(mission))) return palette.city;
  if (mission === 'return') return palette.visible;
  return palette.army;
}

/** Numeric glyphs work with the existing map font; readable Arabic labels live in the panel. */
export function armyEta(arrivalTime: number, serverTime: number): string {
  const seconds = Math.max(0, Math.ceil((arrivalTime - serverTime) / 1000));
  if (seconds === 0) return '…'; // Await a server snapshot; never claim arrival locally.
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

function routePoint(route: Feature, time: number): { point: Position; bearing: number } | null {
  const shape = route.geometry;
  const points =
    shape.type === 'LineString'
      ? shape.coordinates
      : shape.type === 'MultiLineString'
        ? shape.coordinates.flat()
        : [];
  const departure = Number(route.properties.departureTime);
  const arrival = Number(route.properties.arrivalTime);
  if (points.length < 2 || !Number.isFinite(departure) || arrival <= departure) return null;
  const lengths = points
    .slice(1)
    .map((point, i) =>
      Math.hypot(deltaLongitude(points[i]![0], point[0]), point[1] - points[i]![1]),
    );
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (!total) return null;
  const progress = Math.max(0, Math.min(1, (time - departure) / (arrival - departure)));
  let remaining = total * progress;
  for (let index = 0; index < lengths.length; index++) {
    const length = lengths[index]!;
    if (!length) continue; // A split at ±180 is the same geographic point.
    if (remaining > length && index < lengths.length - 1) {
      remaining -= length;
      continue;
    }
    const origin = points[index]!,
      target = points[index + 1]!;
    const fraction = Math.min(1, remaining / length);
    const delta = deltaLongitude(origin[0], target[0]);
    return {
      point: [wrap(origin[0] + delta * fraction), origin[1] + (target[1] - origin[1]) * fraction],
      bearing: ((Math.atan2(delta, target[1] - origin[1]) * 180) / Math.PI + 360) % 360,
    };
  }
  return null;
}

/** Presentation only, from an unexpired authorized snapshot. Never extrapolates rival armies. */
export function presentArmies(
  payload: MapPayload,
  serverTime: number,
  palette: MapPalette,
): FeatureCollection {
  const routes = new Map(payload.layers.armyRoutes.features.map((route) => [route.id, route]));
  return {
    type: 'FeatureCollection',
    features: payload.layers.armies.features.map((army) => {
      const route = army.properties.own === true ? routes.get(army.id) : undefined;
      if (!route || army.geometry.type !== 'Point') return army;
      const reference = routePoint(route, payload.serverTime);
      const current = routePoint(route, Math.max(payload.serverTime, serverTime));
      // Unsupported trajectories keep the authoritative position. Do not substitute a new path.
      const agrees =
        reference &&
        Math.abs(deltaLongitude(reference.point[0], army.geometry.coordinates[0])) < 0.000001 &&
        Math.abs(reference.point[1] - army.geometry.coordinates[1]) < 0.000001;
      const mission = route.properties.mission;
      return {
        ...army,
        geometry: agrees && current ? { type: 'Point', coordinates: current.point } : army.geometry,
        properties: {
          ...army.properties,
          __mamlukMissionColor: armyMissionColor(mission, palette),
          __mamlukMissionLabel: ARMY_MISSION_LABELS[String(mission)] ?? 'مسير',
          __mamlukMissionSymbol: symbols[String(mission)] ?? '•',
          __mamlukBearing: current?.bearing ?? 0,
          __mamlukEta: armyEta(Number(route.properties.arrivalTime), serverTime),
          __mamlukTraveling: true,
        },
      };
    }),
  };
}

export function presentArmyRoutes(payload: MapPayload, palette: MapPalette): FeatureCollection {
  const owned = new Set(
    payload.layers.armies.features
      .filter((army) => army.properties.own === true)
      .map((army) => army.id),
  );
  return {
    ...payload.layers.armyRoutes,
    features: payload.layers.armyRoutes.features.map((route) =>
      owned.has(route.id)
        ? {
            ...route,
            properties: {
              ...route.properties,
              __mamlukMissionColor: armyMissionColor(route.properties.mission, palette),
            },
          }
        : route,
    ),
  };
}

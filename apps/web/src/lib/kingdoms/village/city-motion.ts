import type { WorldPoint, WorldSize } from './types';

export type CityActorRoute = Readonly<{
  kind: 'guard' | 'worker' | 'caravan';
  points: readonly WorldPoint[];
  duration: number;
  offset: number;
  speed?: number;
  height?: number;
  pause?: number;
}>;

type RouteGeometry = { width: number; height: number; lengths: number[]; total: number };
const geometryCache = new WeakMap<CityActorRoute, RouteGeometry>();

function geometry(route: CityActorRoute, world: WorldSize): RouteGeometry {
  const cached = geometryCache.get(route);
  if (cached?.width === world.width && cached.height === world.height) return cached;
  const lengths = [0];
  for (let index = 1; index < route.points.length; index++) {
    const a = route.points[index - 1], b = route.points[index];
    lengths.push(lengths[index - 1] + Math.hypot((b.x - a.x) * world.width, (b.y - a.y) * world.height));
  }
  const result = { width: world.width, height: world.height, lengths, total: lengths.at(-1) ?? 0 };
  geometryCache.set(route, result);
  return result;
}

const smoothstep = (value: number) => value * value * (3 - 2 * value);
const integral = (value: number) => value ** 3 - value ** 4 / 2;

/** Arc length drives both translation and gait. Acceleration ends before cruise;
 * the pose changes direction only while the feet are stationary. Units are
 * logical artwork pixels, not CSS pixels or inferred real-world metres. */
export function sampleCityRoute(route: CityActorRoute, elapsed: number, world: WorldSize) {
  const shape = geometry(route, world);
  const first = route.points[0] ?? { x: 0, y: 0 };
  if (route.points.length < 2 || shape.total < .001) {
    return { x: first.x * world.width, y: first.y * world.height, facing: 1, heading: 1, turnMix: 0, speed: 0, distance: 0, gait: 0, turning: false };
  }
  const cruise = Math.max(.01, route.speed ?? shape.total * 2 / Math.max(.001, route.duration / 1000));
  const ramp = Math.min(.8, shape.total / cruise / 3);
  const travel = shape.total / cruise + ramp;
  const pause = Math.max(.35, (route.pause ?? 850) / 1000);
  const half = travel + pause, period = half * 2;
  const time = (((elapsed + route.offset) / 1000) % period + period) % period;
  const returning = time >= half;
  const leg = returning ? time - half : time;
  const t = Math.min(travel, leg);
  let distance: number, speed: number;
  if (t < ramp) {
    distance = cruise * ramp * integral(t / ramp);
    speed = cruise * smoothstep(t / ramp);
  } else if (t > travel - ramp) {
    const remaining = (travel - t) / ramp;
    distance = shape.total - cruise * ramp * integral(remaining);
    speed = cruise * smoothstep(remaining);
  } else {
    distance = cruise * (t - ramp / 2);
    speed = cruise;
  }
  const along = returning ? shape.total - distance : distance;
  let index = 0;
  while (index < shape.lengths.length - 2 && along > shape.lengths[index + 1]) index++;
  const a = route.points[index], b = route.points[index + 1];
  const fraction = (along - shape.lengths[index]) / Math.max(.001, shape.lengths[index + 1] - shape.lengths[index]);
  const resting = leg >= travel;
  const turned = resting && leg - travel >= pause / 2;
  const forward = (b.x >= a.x ? 1 : -1) * (returning ? -1 : 1);
  const totalDistance = returning ? shape.total + distance : distance;
  const stride = (route.height ?? (route.kind === 'caravan' ? 22 : 14)) * .7;
  return {
    x: (a.x + (b.x - a.x) * fraction) * world.width,
    y: (a.y + (b.y - a.y) * fraction) * world.height,
    facing: forward * (turned ? -1 : 1),
    heading: forward,
    turnMix: resting ? smoothstep(Math.max(0, Math.min(1, (leg - travel - pause / 2 + .16) / .32))) : 0,
    speed: resting ? 0 : speed,
    distance: totalDistance,
    gait: (totalDistance / stride + route.offset / 1379) % 1,
    turning: resting && Math.abs(leg - travel - pause / 2) < .16,
  };
}

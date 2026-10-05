import type { WorldPoint, WorldRect, WorldSize } from './types';

/** Find the largest unobstructed rectangle using the small, bounded set of HUD panels. */
export function visibleMapAnchor(map: WorldRect, screen: WorldSize, overlays: readonly WorldRect[]): WorldPoint {
  const left = Math.max(0, map.x);
  const top = Math.max(0, map.y);
  const right = Math.min(screen.width, map.x + map.width);
  const bottom = Math.min(screen.height, map.y + map.height);
  let free: WorldRect[] = [{ x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }];
  for (const overlay of overlays) {
    free = free.flatMap((area) => {
      const x1 = Math.max(area.x, overlay.x);
      const y1 = Math.max(area.y, overlay.y);
      const x2 = Math.min(area.x + area.width, overlay.x + overlay.width);
      const y2 = Math.min(area.y + area.height, overlay.y + overlay.height);
      if (x1 >= x2 || y1 >= y2) return [area];
      return [
        { ...area, width: x1 - area.x },
        { ...area, x: x2, width: area.x + area.width - x2 },
        { ...area, height: y1 - area.y },
        { ...area, y: y2, height: area.y + area.height - y2 },
      ].filter(({ width, height }) => width > 0 && height > 0);
    }).sort((a, b) => b.width * b.height - a.width * a.height).slice(0, 8);
  }
  const area = free[0];
  return area
    ? { x: area.x + area.width / 2 - map.x, y: area.y + area.height / 2 - map.y }
    : { x: map.width / 2, y: map.height / 2 };
}

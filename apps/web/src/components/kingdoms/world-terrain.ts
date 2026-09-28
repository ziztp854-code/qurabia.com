export type MapPoint = { x: number; y: number };

// Decorative geography is a pure function of world coordinates, never game rules.
export function terrainAt(x: number, y: number) {
  const noise = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  const seed = noise - Math.floor(noise);
  const elevation = Math.sin(x * 0.63) + Math.cos(y * 0.51) + Math.sin((x + y) * 0.38);
  return {
    seed,
    kind: elevation > 1.45 ? 'mountain' : elevation < -0.15 ? 'forest' : 'plain',
  } as const;
}

export function riverY(x: number) {
  return Math.sin(x * 0.31) * 2.3 + Math.sin(x * 0.09) * 1.2 + x * 0.12;
}

export function moveMapCenter(point: MapPoint, dx: number, dy: number, radius: number): MapPoint {
  return {
    x: Math.max(-radius, Math.min(radius, point.x + dx)),
    y: Math.max(-radius, Math.min(radius, point.y + dy)),
  };
}

import { projectPoint } from './cameraMath';
import type { CameraSnapshot, WorldPoint, WorldRect } from './types';

export type VillageLabelAnchor = WorldPoint & Readonly<{ id: string }>;
export type VillageLabelDensity = 'overview' | 'village' | 'detail';

export function getVillageLabelDensity(zoom: number, previous?: VillageLabelDensity): VillageLabelDensity {
  // A small band prevents label flicker while a pinch crosses a density boundary.
  if (previous === 'overview' && zoom <= 1.6) return 'overview';
  if (previous === 'village' && zoom >= 1.4 && zoom <= 2.5) return 'village';
  if (previous === 'detail' && zoom >= 2.3) return 'detail';
  return zoom < 1.5 ? 'overview' : zoom < 2.4 ? 'village' : 'detail';
}

export function villageLabelPoint(label: VillageLabelAnchor, camera: CameraSnapshot, selected: string | null, topInset = 0): WorldPoint {
  const point = projectPoint(label, camera);
  if (label.id !== selected) return point;
  return {
    x: Math.max(60, Math.min(camera.viewport.width - 60, point.x)),
    y: Math.max(topInset + 48, Math.min(camera.viewport.height - 4, point.y)),
  };
}

// Labels stay 112 × 44 screen pixels at every zoom. Hide crowded labels, never hotspots.
export function visibleVillageLabels(
  labels: readonly VillageLabelAnchor[],
  camera: CameraSnapshot,
  selected: string | null,
  blockedAreas: readonly WorldRect[] = [],
  topInset = 0,
  density: VillageLabelDensity = getVillageLabelDensity(camera.zoom),
): string[] {
  const priority = (id: string) => id === selected ? 2 : id === 'hall' ? 1 : 0;
  const ordered = [...labels].sort((a, b) => priority(b.id) - priority(a.id));
  const limit = camera.viewport.width <= 700
    ? { overview: 3, village: 5, detail: 8 }[density]
    : labels.length;
  const placed: { id: string; x: number; y: number }[] = [];
  for (const label of ordered) {
    if (placed.length >= limit) break;
    const point = villageLabelPoint(label, camera, selected, topInset);
    const rect = { id: label.id, x: point.x - 56, y: point.y - 44 };
    if (rect.x < 4 || rect.y < 4 || rect.x + 112 > camera.viewport.width - 4 || rect.y + 44 > camera.viewport.height - 4) continue;
    if (blockedAreas.some((area) => rect.x < area.x + area.width && rect.x + 112 > area.x && rect.y < area.y + area.height && rect.y + 44 > area.y)) continue;
    if (placed.some((other) => rect.x < other.x + 120 && rect.x + 120 > other.x && rect.y < other.y + 52 && rect.y + 52 > other.y)) continue;
    placed.push(rect);
  }
  return placed.map(({ id }) => id);
}

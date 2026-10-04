import { projectPoint } from './cameraMath';
import type { CameraSnapshot, WorldPoint, WorldRect } from './types';

export type VillageLabelAnchor = WorldPoint & Readonly<{ id: string }>;
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
): string[] {
  const ordered = [...labels].sort((a, b) => Number(b.id === selected) - Number(a.id === selected));
  const placed: { id: string; x: number; y: number }[] = [];
  for (const label of ordered) {
    const point = villageLabelPoint(label, camera, selected, topInset);
    const rect = { id: label.id, x: point.x - 56, y: point.y - 44 };
    if (rect.x < 4 || rect.y < 4 || rect.x + 112 > camera.viewport.width - 4 || rect.y + 44 > camera.viewport.height - 4) continue;
    if (blockedAreas.some((area) => rect.x < area.x + area.width && rect.x + 112 > area.x && rect.y < area.y + area.height && rect.y + 44 > area.y)) continue;
    if (placed.some((other) => rect.x < other.x + 120 && rect.x + 120 > other.x && rect.y < other.y + 52 && rect.y + 52 > other.y)) continue;
    placed.push(rect);
  }
  return placed.map(({ id }) => id);
}

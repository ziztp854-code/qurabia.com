import type { Building, KingdomsView, Village } from '../types';
import type { VillageBuildingId } from './buildingRegistry';

export type WorldPoint = Readonly<{ x: number; y: number }>;
export type WorldSize = Readonly<{ width: number; height: number }>;
export type WorldRect = WorldPoint & WorldSize;
export type CameraSnapshot = Readonly<{
  x: number;
  y: number;
  zoom: number;
  scale: number;
  viewport: WorldSize;
}>;
export type VillageQuality = 'auto' | 'ultra' | 'high' | 'medium' | 'low';
export type VillageSelection = Building | 'stable' | 'rally';
export type VillageTarget = VillageSelection | 'gate';
export type VillagePlacement = WorldRect &
  Readonly<{
    focusX: number;
    focusY: number;
    focusScale: number;
    zIndex: number;
  }>;
export type VillageSceneHandle = {
  focusOn: (target: VillageTarget, onComplete?: () => void) => void;
  zoomBy: (factor: number) => void;
  zoomTo: (zoom: number, onComplete?: () => void) => void;
  reset: () => void;
  panBy: (dx: number, dy: number) => void;
  getSnapshot: () => CameraSnapshot;
};
export type VillageDebugOptions = Readonly<{
  hitboxes?: boolean;
  coordinates?: boolean;
  npcs?: boolean;
  animations?: boolean;
  building?: VillageBuildingId;
  buildingLevel?: number;
  rectOverrides?: Partial<Record<VillageBuildingId, WorldRect>>;
  placementOverrides?: Partial<
    Record<
      VillageBuildingId,
      Readonly<Partial<Pick<VillagePlacement, 'focusX' | 'focusY' | 'focusScale' | 'zIndex'>>>
    >
  >;
}>;
export type VillageCanvasProps = Readonly<{
  view: KingdomsView;
  village: Village;
  selected: VillageSelection | null;
  onSelect: (building: VillageSelection) => void;
  onWorldMap?: () => void;
  quality: VillageQuality;
  reducedMotion: boolean;
  showLabels: boolean;
  debug?: VillageDebugOptions;
  onReady?: () => void;
  showThreatMarker?: boolean;
  threatSeverity?: 'DANGER' | 'CRITICAL';
}>;

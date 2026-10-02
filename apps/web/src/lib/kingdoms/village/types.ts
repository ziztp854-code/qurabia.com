import type { Building, KingdomsView, Village } from '../types';

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
export type VillageQuality = 'auto' | 'high' | 'medium' | 'low';
export type VillageTarget = Building | 'gate';
export type VillageSceneHandle = {
  focusOn: (target: VillageTarget, onComplete?: () => void) => void;
  zoomBy: (factor: number) => void;
  reset: () => void;
  panBy: (dx: number, dy: number) => void;
  getSnapshot: () => CameraSnapshot;
};
export type VillageDebugOptions = Readonly<{
  hitboxes?: boolean;
  coordinates?: boolean;
  npcs?: boolean;
  animations?: boolean;
  building?: Building;
  buildingLevel?: number;
  rectOverrides?: Partial<Record<Building, WorldRect>>;
}>;
export type VillageCanvasProps = Readonly<{
  view: KingdomsView;
  village: Village;
  selected: Building | null;
  onSelect: (building: Building) => void;
  onWorldMap?: () => void;
  quality: VillageQuality;
  reducedMotion: boolean;
  showLabels: boolean;
  debug?: VillageDebugOptions;
  onReady?: () => void;
}>;

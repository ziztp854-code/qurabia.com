import { gardenSlots, type GardenPlacement } from '../palace-garden';
import type { WorldRect } from './types';

export const PALACE_WORLD = { width: 1670, height: 942 } as const;
export const palaceZoomPresets = {
  FULLPALACE: { x: 0, y: 0, width: 1670, height: 942 },
  ENTRANCE: { x: 700, y: 255, width: 270, height: 145 },
  GARDEN: { x: 385, y: 390, width: 900, height: 350 },
  FOUNTAIN: { x: 745, y: 430, width: 180, height: 205 },
} as const satisfies Record<string, WorldRect>;
export type PalacePreset = keyof typeof palaceZoomPresets | 'GARDENSLOT';
export function palaceSlotBounds(id: number): WorldRect {
  const slot = gardenSlots[id];
  if (!slot) throw new RangeError('Unknown garden slot');
  const width = id < 8 ? 56 : 170, height = id < 4 ? 28 : id < 8 ? 32 : 72;
  return { x: slot.x * PALACE_WORLD.width - width / 2, y: slot.y * PALACE_WORLD.height - height / 2, width, height };
}
/** Growth is a presentation state only; the game has no growth clock/cost. */
export function palaceGardenSlots(placements: readonly GardenPlacement[], selected: number | null) {
  return gardenSlots.map(slot => {
    const placement = placements.find(item => item.slotId === slot.id);
    return { id: slot.id, position: { x: slot.x * PALACE_WORLD.width, y: slot.y * PALACE_WORLD.height }, bounds: palaceSlotBounds(slot.id),
      selectedPlant: placement?.itemId ?? null, selectedColor: placement?.color ?? null,
      growthStage: 'mature' as const, ownerCustomization: placement ?? null,
      interactionState: slot.id === selected ? 'selected' as const : 'idle' as const };
  });
}

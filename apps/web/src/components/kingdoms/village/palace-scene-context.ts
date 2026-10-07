import { createContext } from 'react';
import type { GardenPlacement } from '@/lib/kingdoms/palace-garden';

export const PalaceSceneContext = createContext<{
  ready: boolean;
  selectedSlot: number | null;
  setGarden: (garden: readonly GardenPlacement[]) => void;
  focusSlot: (id: number) => void;
  selectSlot: (id: number) => void;
  registerSelection: (listener: (id: number) => void) => () => void;
  clearSelection: () => void;
} | null>(null);

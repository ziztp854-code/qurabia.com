import { createContext } from 'react';
export const FarmSceneContext = createContext<{
  motionPaused: boolean;
  setMotionPaused: (value: boolean) => void;
  selected: number;
  select: (id: number) => void;
  registerFocus: (listener: (id: number) => void) => () => void;
} | null>(null);

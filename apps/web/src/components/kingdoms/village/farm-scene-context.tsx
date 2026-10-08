import { createContext } from 'react';
export const FarmSceneContext = createContext<{
  selected: number;
  select: (id: number) => void;
  registerFocus: (listener: (id: number) => void) => () => void;
} | null>(null);

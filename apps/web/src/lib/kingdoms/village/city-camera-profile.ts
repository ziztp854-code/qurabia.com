import type { WorldSize } from './types';

export type CityCameraState = 'CITY_OVERVIEW' | 'CITY_EXPLORE' | 'BUILDING_FOCUS' | 'BUILDING_SCENE';
export type CityCameraProfile = Readonly<{
  id: 'desktop' | 'portrait';
  world: WorldSize;
}>;

// Each profile has independent artwork and placements; these are presentation
// coordinates, never persisted building or player positions.
export const CITY_DESKTOP_PROFILE: CityCameraProfile = {
  id: 'desktop', world: { width: 1600, height: 900 },
};
export const CITY_PORTRAIT_PROFILE: CityCameraProfile = {
  id: 'portrait', world: { width: 900, height: 1600 },
};

export function getCityCameraProfile(viewport: WorldSize): CityCameraProfile {
  return viewport.height > viewport.width ? CITY_PORTRAIT_PROFILE : CITY_DESKTOP_PROFILE;
}

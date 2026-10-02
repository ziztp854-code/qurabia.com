'use client';

import { VillageScene, type VillageSceneProps } from './village/village-scene';

export function VillageMap(props: VillageSceneProps) {
  return <VillageScene {...props} />;
}

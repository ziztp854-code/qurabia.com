import { buildingKeys, type Building, type KingdomsConfig, type Village } from '@/lib/kingdoms/types';

export type SceneBuilding = {
  key: Building;
  name: string;
  level: number;
  maxLevel: number;
  progress: number;
  progressKnown: boolean;
  busy: boolean;
  built: boolean;
};

export function sceneBuildings(village: Village, config: KingdomsConfig, now: number): SceneBuilding[] {
  return buildingKeys.map((key) => {
    const level = village.buildings[key];
    const build = village.build?.building === key ? village.build : undefined;
    const startedAt = build?.startedAt ?? now;
    const duration = (build?.endsAt ?? now) - startedAt;
    const progressKnown = build?.startedAt !== undefined && duration > 0;
    const progress = progressKnown ? Math.min(1, Math.max(0, (now - startedAt) / duration)) : 0;
    return {
      key,
      name: config.buildings[key].name,
      level,
      maxLevel: config.buildings[key].maxLevel,
      progress,
      progressKnown,
      busy: Boolean(build),
      built: level > 0,
    };
  });
}

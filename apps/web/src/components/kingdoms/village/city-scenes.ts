import type { VillageSelection, VillageTarget } from '@/lib/kingdoms/village/types';

export type CitySceneKey = 'palace' | 'barracks' | 'stable' | 'market' | 'war-council' | 'siege-workshop' | 'farm' | 'mine' | 'lumber' | 'quarry' | 'treasury' | 'warehouse' | 'wall' | 'embassy';

export const cityScenes: Record<CitySceneKey, { title: string; asset: string; target: VillageTarget }> = {
  palace: { title: 'قصر السلطان', asset: 'palace', target: 'hall' },
  barracks: { title: 'الثكنة', asset: 'barracks', target: 'barracks' },
  stable: { title: 'الإسطبل', asset: 'stable', target: 'stable' },
  market: { title: 'السوق', asset: 'market', target: 'market' },
  'war-council': { title: 'مجلس الحرب', asset: 'war-council', target: 'rally' },
  'siege-workshop': { title: 'ورشة الحصار', asset: 'siege-workshop', target: 'siege' },
  farm: { title: 'المزارع والحقول', asset: 'farm', target: 'farm' },
  mine: { title: 'مناجم الحديد', asset: 'mine', target: 'mine' },
  lumber: { title: 'حطّابو المملكة', asset: 'farm', target: 'lumber' },
  quarry: { title: 'محاجر الحجر', asset: 'mine', target: 'quarry' },
  treasury: { title: 'خزانة السلطان', asset: 'palace', target: 'treasury' },
  warehouse: { title: 'مخازن المملكة', asset: 'market', target: 'warehouse' },
  wall: { title: 'أسوار المملكة', asset: 'barracks', target: 'wall' },
  embassy: { title: 'دار السفارة', asset: 'palace', target: 'embassy' },
};

export const citySceneForBuilding = (building: VillageSelection): CitySceneKey => building === 'hall' ? 'palace' : building === 'rally' ? 'war-council' : building;
const portraitAssets = new Set(['barracks', 'stable', 'market', 'war-council', 'siege-workshop', 'farm', 'mine']);
export const citySceneAsset = (scene: CitySceneKey, mobile = false) => {
  const asset = scene === 'palace' ? 'palace-courtyard-user' : cityScenes[scene].asset;
  const suffix = mobile ? portraitAssets.has(asset) ? '-portrait' : '-mobile' : '';
  return `/game-art/kingdoms/city-scenes/${asset}${suffix}.webp`;
};

const prefetched = new Set<string>();
export function prefetchCityScene(scene: CitySceneKey) {
  if (typeof window === 'undefined' || typeof Image === 'undefined') return;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return;
  const src = citySceneAsset(scene, window.matchMedia('(max-width: 700px)').matches);
  if (prefetched.has(src)) return;
  prefetched.add(src);
  const image = new Image();
  image.decoding = 'async';
  image.onerror = () => prefetched.delete(src);
  image.src = src;
}

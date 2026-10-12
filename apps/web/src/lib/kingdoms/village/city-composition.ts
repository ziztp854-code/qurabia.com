import { getCityCameraProfile, CITY_DESKTOP_PROFILE, CITY_PORTRAIT_PROFILE } from './city-camera-profile';
import type { VillageBuildingId } from './buildingRegistry';
import type { VillageDebugOptions, VillagePlacement, VillageTarget, WorldPoint, WorldRect, WorldSize } from './types';
import { gardenSlotsSchema } from '../palace-garden';
import { sampleCityRoute, type CityActorRoute } from './city-motion';
export type { CityActorRoute } from './city-motion';

export type CityCompositionId = 'desktop' | 'portrait';
const cityNativeSizes = {
  desktop: { width: 2730, height: 1536 },
  portrait: { width: 1536, height: 2752 },
} as const;
export const cityAssets = {
  desktop: {
    asset: '/game-art/kingdoms/city-hub/overview-desktop-gemini-hd.webp',
    mobileAsset: '/game-art/kingdoms/city-hub/overview-desktop-gemini-hd.webp',
    avifAsset: '/game-art/kingdoms/city-hub/overview-desktop-gemini-hd.avif',
  },
  portrait: {
    asset: '/game-art/kingdoms/city-hub/overview-portrait-gemini-hd.webp',
    mobileAsset: '/game-art/kingdoms/city-hub/overview-portrait-gemini-hd.webp',
    avifAsset: '/game-art/kingdoms/city-hub/overview-portrait-gemini-hd.avif',
  },
} as const;
// Existing decorative garden gate; shared by native fallback and Pixi facility input.
export function sultanGardenEntranceRect(composition: CityCompositionId) {
  return composition === 'desktop'
    ? { x: 0.42 * 1600, y: 0.25 * 900, width: 0.16 * 1600, height: 0.1 * 900 }
    : { x: 0.39 * 900, y: 0.29 * 1600, width: 0.23 * 900, height: 0.1 * 1600 };
}
export type CityLandmark = Readonly<{ id: VillageBuildingId; name: string; rect: WorldRect; classification: 'existing' | 'shared' | 'decoration' | 'reserved'; target?: VillageTarget }>;

// Presentation-only sites calibrated inside the cleared courtyards in each raster.
// They never enter the building registry, saved plots or the command contract.
const reservedSiteRects = {
  desktop: { knowledge: { x: 1836, y: 225, width: 450, height: 250 }, blacksmith: { x: 2150, y: 790, width: 450, height: 270 } },
  portrait: { knowledge: { x: 1170, y: 400, width: 200, height: 180 }, blacksmith: { x: 980, y: 1850, width: 220, height: 180 } },
} as const;

// Calibrated against the two independently authored rasters, not persisted player plots.
const centers = {
  desktop: { hall:[1365,150], barracks:[650,570], stable:[540,760], market:[1790,660], rally:[1350,730], siege:[900,1050], blacksmith:[2375,925], warehouse:[1760,970], granary:[1900,970], knowledge:[2061,350], mosque:[2290,500], residential:[2400,660], mine:[160,90], quarry:[500,100], treasury:[2440,110], lumber:[230,360], farm:[1365,1470], gate:[1365,1220], tower:[300,980], wall:[1800,1120], embassy:[700,330], citadel:[1365,150], caravanserai:[1800,700], traders:[1790,660], industry:[2375,925], archery:[650,570], hospital:[950,520], madrasa:[2061,350], courthouse:[700,330], hammam:[2350,600] },
  portrait: { hall:[768,360], barracks:[220,1180], stable:[260,1450], market:[1240,1240], rally:[768,1450], siege:[210,1720], blacksmith:[1090,1940], warehouse:[1230,1750], granary:[1380,1850], knowledge:[1270,490], mosque:[768,250], residential:[1380,800], quarry:[320,150], mine:[150,120], treasury:[1380,140], lumber:[270,2000], farm:[768,2600], gate:[768,2260], tower:[460,2220], wall:[1100,2200], embassy:[220,850], citadel:[768,360], caravanserai:[1200,1380], traders:[1240,1240], industry:[1090,1940], archery:[220,1180], hospital:[420,1150], madrasa:[1270,490], courthouse:[220,850], hammam:[1330,1050] },
} as const satisfies Record<CityCompositionId, Record<VillageBuildingId, readonly [number, number]>>;

const entries = [
  ['hall','قصر السلطان','existing','hall',.22,.15], ['barracks','الثكنة','existing','barracks',.23,.14],
  ['stable','الإسطبل','shared','stable',.22,.16], ['market','السوق','existing','market',.23,.15],
  ['rally','مجلس الحرب','shared','rally',.105,.12], ['siege','ورشة الحصار','shared','siege',.15,.12],
  ['blacksmith','مساحة الحداد','reserved',undefined,.095,.10], ['warehouse','المخازن','existing','warehouse',.12,.09],
  ['granary','مخزن الغلال','shared','warehouse',.09,.07], ['farm','المزارع والحقول','existing','farm',.82,.28],
  ['mine','مناجم الحديد','existing','mine',.10,.10], ['quarry','محاجر الحجر','existing','quarry',.11,.10],
  ['treasury','خزانة الذهب','existing','treasury',.115,.095], ['lumber','معسكر الأخشاب','existing','lumber',.16,.12],
  ['embassy','دار السفارة','existing','embassy',.075,.085], ['wall','أسوار المملكة','existing','wall',.14,.065],
  ['gate','بوابة المملكة','shared','gate',.09,.12], ['tower','أبراج الحراسة','shared','wall',.065,.105],
  ['knowledge','مساحة الأكاديمية','reserved',undefined,.095,.07],
  ['mosque','جامع المدينة · معلم حضاري','decoration',undefined,.11,.105],
  ['residential','الحي السكني · معلم حضاري','decoration',undefined,.14,.12],
] as const;

function landmarkRect(id: VillageBuildingId, composition: CityCompositionId, width: number, height: number): WorldRect {
  const world = composition === 'desktop' ? CITY_DESKTOP_PROFILE.world : CITY_PORTRAIT_PROFILE.world;
  const native = cityNativeSizes[composition];
  if (id === 'knowledge' || id === 'blacksmith') {
    const rect = reservedSiteRects[composition][id];
    return { x: rect.x / native.width * world.width, y: rect.y / native.height * world.height,
      width: rect.width / native.width * world.width, height: rect.height / native.height * world.height };
  }
  const [cx,cy] = centers[composition][id];
  const w = width * world.width;
  const h = height * world.height;
  return { x: Math.max(0,Math.min(world.width-w,cx/native.width*world.width-w/2)), y:Math.max(0,Math.min(world.height-h,cy/native.height*world.height-h/2)), width:w,height:h };
}

export function getCityComposition(viewport: WorldSize) {
  const profile = getCityCameraProfile(viewport);
  const landmarks: CityLandmark[] = entries.map(([id,name,classification,target,width,height]) => ({
    id,name,classification,target,rect: landmarkRect(id,profile.id,width, profile.id==='portrait' ? height*.67 : height),
  }));
  const garden = profile.id === 'desktop' ? {x:.38,y:.18,width:.24,height:.16} : {x:.24,y:.18,width:.52,height:.20};
  landmarks.push({id:'citadel',name:'حدائق السلطان',classification:'shared',target:'hall',rect:{x:garden.x*profile.world.width,y:garden.y*profile.world.height,width:garden.width*profile.world.width,height:garden.height*profile.world.height}});
  const routes: CityActorRoute[] = profile.id === 'desktop' ? [
    // Side-view atlases patrol visible, nearly lateral ground corridors. In
    // particular neither gate tower is a walkable continuation of the avenue.
    {kind:'guard',points:[{x:.502,y:.617},{x:.536,y:.617}],duration:42000,offset:0,speed:8,height:13},
    {kind:'guard',points:[{x:.233,y:.401},{x:.316,y:.401}],duration:42000,offset:7200,speed:8,height:12},
    {kind:'worker',points:[{x:.62,y:.669},{x:.652,y:.669}],duration:33000,offset:3400,speed:12,height:13},
    {kind:'worker',points:[{x:.35,y:.625},{x:.42,y:.625}],duration:36000,offset:8100,speed:11,height:13},
    {kind:'caravan',points:[{x:.563,y:.88},{x:.60,y:.88}],duration:40000,offset:2700,speed:16,height:21,pause:1200},
  ] : [
    {kind:'guard',points:[{x:.23,y:.344},{x:.375,y:.344}],duration:38000,offset:4100,speed:9,height:15},
    {kind:'guard',points:[{x:.485,y:.625},{x:.538,y:.625}],duration:36000,offset:0,speed:10,height:17},
    {kind:'worker',points:[{x:.47,y:.553},{x:.53,y:.553}],duration:30000,offset:5600,speed:13,height:16},
    {kind:'worker',points:[{x:.46,y:.625},{x:.52,y:.625}],duration:31000,offset:1700,speed:13,height:16},
    {kind:'caravan',points:[{x:.48,y:.79},{x:.55,y:.79}],duration:36000,offset:3600,speed:18,height:25,pause:1200},
  ];
  return { ...profile, landmarks, routes, ...cityAssets[profile.id], native: cityNativeSizes[profile.id],
    canals: profile.id==='desktop' ? [{x:.30,y:.748},{x:.40,y:.775},{x:.64,y:.80},{x:.83,y:.745}] : [{x:.05,y:.43},{x:.05,y:.57},{x:.33,y:.745},{x:.75,y:.747}],
    palms: profile.id==='desktop' ? [{x:.42,y:.90},{x:.67,y:.90}] : [{x:.275,y:.905},{x:.715,y:.83}],
    flags: profile.id==='desktop' ? [{x:.477,y:.64},{x:.57,y:.64}] : [{x:.416,y:.674},{x:.585,y:.674}],
  };
}

export function cityGardenPlacements(village: object) {
  const saved='palaceGarden' in village ? village.palaceGarden : undefined;
  const slots=saved && typeof saved==='object' && 'slots' in saved ? saved.slots : undefined;
  const result=gardenSlotsSchema.safeParse(slots);
  return result.success ? result.data : [];
}

export function getCityPlacement(id: VillageBuildingId, composition: CityCompositionId, debug?: VillageDebugOptions): VillagePlacement {
  const profile = getCityComposition(composition==='desktop' ? {width:1600,height:900} : {width:900,height:1600});
  const rect = (process.env.NODE_ENV==='development' ? debug?.rectOverrides?.[id] : undefined)
    ?? profile.landmarks.find((landmark)=>landmark.id===id)?.rect ?? landmarkRect(id,composition,.06,.06);
  return { ...rect, focusX:rect.x+rect.width/2, focusY:rect.y+rect.height/2, focusScale:1.6, zIndex:rect.y+rect.height,
    ...(process.env.NODE_ENV==='development' ? debug?.placementOverrides?.[id] : undefined) };
}

export function cityActorPosition(route: CityActorRoute, elapsed: number, world: WorldSize) {
  return sampleCityRoute(route, elapsed, world);
}

// Keep enlarged touch targets out of the vacant sites at compact overview scales.
export function cityPointInReservedSite(point: WorldPoint, composition: CityCompositionId) {
  return (['knowledge', 'blacksmith'] as const).some(id => {
    const rect = landmarkRect(id, composition, 0, 0);
    return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
  });
}

import { getCityCameraProfile, CITY_DESKTOP_PROFILE, CITY_PORTRAIT_PROFILE } from './city-camera-profile';
import type { VillageBuildingId } from './buildingRegistry';
import type { VillageDebugOptions, VillagePlacement, VillageTarget, WorldRect, WorldSize } from './types';
import { gardenSlotsSchema } from '../palace-garden';
import { sampleCityRoute, type CityActorRoute } from './city-motion';
export type { CityActorRoute } from './city-motion';

export type CityCompositionId = 'desktop' | 'portrait';
export type CityLandmark = Readonly<{ id: VillageBuildingId; name: string; rect: WorldRect; classification: 'existing' | 'shared' | 'decoration'; target?: VillageTarget }>;

// Calibrated against the two independently authored rasters, not persisted player plots.
const centers = {
  desktop: { hall:[880,94], barracks:[447,328], stable:[348,467], market:[1090,357], rally:[882,455], siege:[646,535], blacksmith:[1240,487], warehouse:[1040,554], granary:[1153,570], knowledge:[1150,172], mosque:[1365,210], residential:[1395,390], mine:[145,60], quarry:[485,90], treasury:[1480,65], lumber:[158,223], farm:[750,835], gate:[858,685], tower:[240,569], wall:[1060,672], embassy:[632,195], citadel:[880,94], caravanserai:[1120,415], traders:[1090,357], industry:[1240,487], archery:[447,328], hospital:[616,322], madrasa:[1150,172], courthouse:[632,195], hammam:[1310,284] },
  portrait: { hall:[435,248], barracks:[281,555], stable:[280,726], market:[592,620], rally:[468,814], siege:[310,938], blacksmith:[650,832], warehouse:[562,933], granary:[673,1001], knowledge:[750,289], mosque:[783,468], residential:[793,674], quarry:[135,142], mine:[746,125], treasury:[839,142], lumber:[123,393], farm:[510,1460], gate:[471,1160], tower:[171,993], wall:[683,1125], embassy:[257,360], citadel:[435,248], caravanserai:[637,715], traders:[592,620], industry:[650,832], archery:[281,555], hospital:[520,525], madrasa:[750,289], courthouse:[257,360], hammam:[840,550] },
} as const satisfies Record<CityCompositionId, Record<VillageBuildingId, readonly [number, number]>>;

const entries = [
  ['hall','قصر السلطان','existing','hall',.22,.15], ['barracks','الثكنة','existing','barracks',.23,.14],
  ['stable','الإسطبل','shared','stable',.22,.16], ['market','السوق','existing','market',.23,.15],
  ['rally','مجلس الحرب','shared','rally',.105,.12], ['siege','ورشة الحصار','shared','siege',.15,.12],
  ['blacksmith','دار الحدادة','shared','siege',.095,.10], ['warehouse','المخازن','existing','warehouse',.12,.09],
  ['granary','مخزن الغلال','shared','warehouse',.09,.07], ['farm','المزارع والحقول','existing','farm',.82,.28],
  ['mine','مناجم الحديد','existing','mine',.14,.10], ['quarry','محاجر الحجر','existing','quarry',.17,.10],
  ['treasury','خزانة الذهب','existing','treasury',.115,.095], ['lumber','معسكر الأخشاب','existing','lumber',.16,.12],
  ['embassy','دار السفارة','existing','embassy',.075,.085], ['wall','أسوار المملكة','existing','wall',.14,.065],
  ['gate','بوابة المملكة','shared','gate',.09,.12], ['tower','أبراج الحراسة','shared','wall',.065,.105],
  ['knowledge','دار المعرفة · معلم حضاري','decoration',undefined,.095,.07],
  ['mosque','جامع المدينة · معلم حضاري','decoration',undefined,.11,.105],
  ['residential','الحي السكني · معلم حضاري','decoration',undefined,.14,.12],
] as const;

function landmarkRect(id: VillageBuildingId, composition: CityCompositionId, width: number, height: number): WorldRect {
  const world = composition === 'desktop' ? CITY_DESKTOP_PROFILE.world : CITY_PORTRAIT_PROFILE.world;
  const native = composition === 'desktop' ? { width:1672,height:941 } : { width:941,height:1672 };
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
  const garden = profile.id === 'desktop' ? {x:.418,y:.16,width:.22,height:.105} : {x:.28,y:.186,width:.37,height:.064};
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
  return { ...profile, landmarks, routes, asset:`/game-art/kingdoms/city-hub/overview-${profile.id}.webp`, mobileAsset:`/game-art/kingdoms/city-hub/overview-${profile.id}-mobile.webp`,
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

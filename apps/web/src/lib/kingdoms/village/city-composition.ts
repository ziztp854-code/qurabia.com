import { getCityCameraProfile, CITY_DESKTOP_PROFILE, CITY_PORTRAIT_PROFILE } from './city-camera-profile';
import type { VillageBuildingId } from './buildingRegistry';
import type { VillageDebugOptions, VillagePlacement, VillageTarget, WorldPoint, WorldRect, WorldSize } from './types';
import { gardenSlotsSchema } from '../palace-garden';

export type CityCompositionId = 'desktop' | 'portrait';
export type CityLandmark = Readonly<{ id: VillageBuildingId; name: string; rect: WorldRect; classification: 'existing' | 'shared' | 'decoration'; target?: VillageTarget }>;
export type CityActorRoute = Readonly<{ kind: 'guard' | 'worker' | 'caravan'; points: readonly WorldPoint[]; duration: number; offset: number }>;

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
    {kind:'guard',points:[{x:.485,y:.59},{x:.485,y:.65},{x:.485,y:.74}],duration:42000,offset:0},
    {kind:'guard',points:[{x:.535,y:.59},{x:.535,y:.65},{x:.535,y:.74}],duration:42000,offset:18000},
    {kind:'worker',points:[{x:.58,y:.455},{x:.72,y:.455},{x:.74,y:.515}],duration:33000,offset:8000},
    {kind:'worker',points:[{x:.31,y:.64},{x:.38,y:.64},{x:.46,y:.645}],duration:36000,offset:0},
    {kind:'caravan',points:[{x:.41,y:.96},{x:.48,y:.87},{x:.51,y:.78}],duration:40000,offset:10000},
  ] : [
    {kind:'guard',points:[{x:.475,y:.245},{x:.475,y:.41},{x:.475,y:.46}],duration:38000,offset:0},
    {kind:'guard',points:[{x:.53,y:.515},{x:.53,y:.58},{x:.53,y:.66}],duration:36000,offset:12000},
    {kind:'worker',points:[{x:.57,y:.435},{x:.68,y:.44},{x:.78,y:.445}],duration:30000,offset:6000},
    {kind:'worker',points:[{x:.255,y:.60},{x:.34,y:.615},{x:.44,y:.62}],duration:31000,offset:0},
    {kind:'caravan',points:[{x:.55,y:.83},{x:.49,y:.785},{x:.49,y:.745}],duration:36000,offset:5000},
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
  const cycle = ((elapsed+route.offset)%route.duration)/route.duration;
  const progress = (cycle < .5 ? cycle*2 : (1-cycle)*2)*(route.points.length-1);
  const index = Math.min(route.points.length-2,Math.floor(progress));
  const start=route.points[index],end=route.points[index+1],fraction=progress-index;
  return { x:(start.x+(end.x-start.x)*fraction)*world.width, y:(start.y+(end.y-start.y)*fraction)*world.height, facing:(end.x>=start.x ? 1 : -1)*(cycle<.5 ? 1 : -1) };
}

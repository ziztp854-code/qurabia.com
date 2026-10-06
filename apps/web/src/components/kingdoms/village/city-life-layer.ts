import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { cityActorPosition, type getCityComposition } from '@/lib/kingdoms/village/city-composition';
import type { QualitySettings } from '@/lib/kingdoms/village/quality';
import type { SceneColors } from './village-layers';
import { gardenAsset, type GardenPlacement } from '@/lib/kingdoms/palace-garden';

export const cityLifeAssets = {
  guard: '/game-art/kingdoms/city-hub/guard-walk-atlas.webp',
  worker: '/game-art/kingdoms/city-hub/worker-walk-atlas.webp',
  caravan: '/game-art/kingdoms/city-hub/horse-caravan-atlas.webp',
  palmA: '/game-art/kingdoms/city-hub/palm-cluster-a.webp',
  palmB: '/game-art/kingdoms/city-hub/palm-cluster-b.webp',
  flags: '/game-art/kingdoms/city-hub/banner-flutter-atlas.webp',
} as const;

export function createCityLifeLayer(city: ReturnType<typeof getCityComposition>, assets: ReadonlyMap<string,Texture>, quality: QualitySettings, colors: SceneColors, garden: readonly GardenPlacement[] = []) {
  const layer=new Container();
  layer.label='city-life';
  layer.sortableChildren=true;
  const owned: Texture[]=[];
  const frames=new Map<string,Texture[]>();
  const gardenArea=city.landmarks.find(landmark=>landmark.id==='citadel')!.rect;
  for(const placement of garden) {
    const atlas=assets.get(gardenAsset(placement.itemId,{thumbnail:true}));
    if(!atlas)continue;
    const sprite=new Sprite(atlas);
    sprite.label=`city-owned-garden-${placement.slotId}`;
    sprite.anchor.set(.5,1);
    const row=Math.floor(placement.slotId/4),column=placement.slotId%4;
    sprite.height=placement.itemId==='cypress-tree'?20:13;
    sprite.scale.x=sprite.scale.y;
    sprite.position.set(gardenArea.x+gardenArea.width*(.15+column*.23),gardenArea.y+gardenArea.height*(.3+row*.25));
    sprite.zIndex=sprite.y;
    layer.addChild(sprite);
  }
  const getFrames=(src:string) => {
    if (frames.has(src)) return frames.get(src)!;
    const atlas=assets.get(src);
    if (!atlas) return [];
    const width=atlas.width/4;
    const next=Array.from({length:4},(_,frame)=>new Texture({source:atlas.source,frame:new Rectangle(frame*width,0,width,atlas.height)}));
    owned.push(...next);
    frames.set(src,next);
    return next;
  };
  const actorBounds={
    guard:[[96,10,240,372],[70,12,207,363],[47,10,202,372],[50,8,189,371]],
    worker:[[28,18,235,455],[27,20,207,454],[22,23,225,456],[35,22,227,454]],
    caravan:[[19,71,246,352],[16,72,244,342],[8,72,238,351],[2,72,238,347]],
  } as const;
  const actors=city.routes.slice(0,Math.max(0,Math.min(quality.npcLimit,city.routes.length))).flatMap((route,index)=>{
    const textures=getFrames(cityLifeAssets[route.kind]);
    if (!textures.length) return [];
    const sprite=new Sprite(textures[0]);
    sprite.label=`city-actor-${route.kind}-${index}`;
    sprite.anchor.set(.5,1);
    const height=route.kind==='caravan'?(city.id==='portrait'?27:22):(city.id==='portrait'?18:14);
    const bounds=actorBounds[route.kind][0];
    const scale=height/(bounds[3]-bounds[1]);
    sprite.scale.set(scale);
    layer.addChild(sprite);
    return [{sprite,route,textures,scale}];
  });
  const palms=city.palms.flatMap((point,index)=>{
    const atlas=assets.get(index===0?cityLifeAssets.palmA:cityLifeAssets.palmB);
    if(!quality.environment||!atlas)return [];
    const sprite=new Sprite(atlas);
    sprite.label=`city-palm-${index}`;
    sprite.anchor.set(index===0?.55:.58,index===0?.96:.97);
    sprite.height=city.id==='portrait'?78:64;
    sprite.scale.x=sprite.scale.y;
    sprite.position.set(point.x*city.world.width,point.y*city.world.height);
    sprite.zIndex=sprite.y;
    layer.addChild(sprite);
    return [{sprite,index}];
  });
  const environment=(['flags'] as const).flatMap(kind=>{
    if (!quality.environment) return [];
    const textures=getFrames(cityLifeAssets[kind]);
    if (!textures.length) return [];
    return city[kind].map((point,index)=>{
      const sprite=new Sprite(textures[0]);
      sprite.label=`city-${kind}-${index}`;
      sprite.anchor.set(.20,.886);
      sprite.height=city.id==='portrait'?34:28;
      sprite.scale.x=sprite.scale.y;
      sprite.position.set(point.x*city.world.width,point.y*city.world.height);
      sprite.zIndex=sprite.y;
      layer.addChild(sprite);
      return {sprite,textures,offset:index*350};
    });
  });
  const glints=new Graphics();
  glints.label='city-water-and-atmosphere';
  glints.zIndex=city.world.height+1;
  layer.addChild(glints);
  let frozenElapsed=0;
  const update=(elapsed:number,animate:boolean,npcs=true)=>{
    if(animate)frozenElapsed=elapsed;
    const time=frozenElapsed;
    for (const actor of actors) {
      actor.sprite.visible=npcs;
      const point=cityActorPosition(actor.route,time,city.world);
      actor.sprite.position.set(point.x,point.y);
      actor.sprite.scale.x=actor.scale*point.facing;
      actor.sprite.zIndex=point.y;
      const frame=Math.floor(time/200)%4;
      actor.sprite.texture=actor.textures[frame];
      const bounds=actorBounds[actor.route.kind][frame];
      actor.sprite.anchor.set((bounds[0]+bounds[2])/2/actor.sprite.texture.width,bounds[3]/actor.sprite.texture.height);
    }
    for (const item of environment) item.sprite.texture=item.textures[Math.floor((time+item.offset)/360)%4];
    for(const palm of palms)palm.sprite.rotation=Math.sin(time/2200+palm.index)*.008;
    glints.clear();
    if (!animate || !quality.environment) return;
    city.canals.forEach((point,index)=>{
      const x=point.x*city.world.width,y=point.y*city.world.height;
      const alpha=.045+.07*(1+Math.sin(elapsed/1800+index*1.8))/2;
      for (let glint=0;glint<3;glint++) glints.moveTo(x+glint*10,y+glint*3).lineTo(x+glint*10+7,y+glint*3+1).stroke({color:colors.light,width:1,alpha});
    });
    if (quality.particles) for(let index=0;index<5;index++) {
      const phase=(elapsed/15000+index*.173)%1;
      glints.circle((.47+index*.013)*city.world.width,(.61-phase*.025)*city.world.height,1).fill({color:colors.dust,alpha:Math.sin(phase*Math.PI)*.13});
    }
  };
  update(0,false);
  return {layer,update,destroy:()=>{layer.destroy({children:true});owned.forEach(texture=>texture.destroy());frames.clear();}};
}

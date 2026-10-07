import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { cityActorPosition, type getCityComposition } from '@/lib/kingdoms/village/city-composition';
import type { QualitySettings } from '@/lib/kingdoms/village/quality';
import type { SceneColors } from './village-layers';
import { gardenAsset, type GardenPlacement } from '@/lib/kingdoms/palace-garden';
import { getGardenProjection } from '@/lib/kingdoms/village/garden-projection';
import { createCityWaterLayer } from './city-water-layer';
import { gardenColorTexture } from './garden-color-texture';

export const cityWaterMaskAsset = (profile: 'desktop' | 'portrait') => `/game-art/kingdoms/city-hub/water-mask-${profile}.png`;

export const cityLifeAssets = {
  guard: '/game-art/kingdoms/city-hub/guard-walk-atlas.webp',
  worker: '/game-art/kingdoms/city-hub/worker-walk-atlas.webp',
  caravan: '/game-art/kingdoms/city-hub/horse-caravan-atlas.webp',
  palmA: '/game-art/kingdoms/city-hub/palm-cluster-a.webp',
  palmB: '/game-art/kingdoms/city-hub/palm-cluster-b.webp',
  flags: '/game-art/kingdoms/city-hub/banner-flutter-atlas.webp',
} as const;

export function createCityLifeLayer(city: ReturnType<typeof getCityComposition>, assets: ReadonlyMap<string,Texture>, quality: QualitySettings, colors: SceneColors, garden: readonly GardenPlacement[] = [], initialElapsed = 0) {
  const layer=new Container();
  layer.label='city-life';
  layer.sortableChildren=true;
  const owned: Texture[]=[];
  const ownedColors: Texture[]=[];
  const frames=new Map<string,Texture[]>();
  const waterMask=assets.get(cityWaterMaskAsset(city.id));
  const water=quality.environment && waterMask ? createCityWaterLayer(city.world,waterMask) : undefined;
  if(water){water.layer.zIndex=-1;layer.addChild(water.layer);}
  for(const placement of garden) {
    const source=assets.get(gardenAsset(placement.itemId,{thumbnail:true}));
    if(!source)continue;
    const colored=placement.color ? gardenColorTexture(source,placement.color,placement.itemId) : null;
    if(colored)ownedColors.push(colored);
    const atlas=colored ?? source;
    const sprite=new Sprite(atlas);
    sprite.label=`city-owned-garden-${placement.slotId}`;
    const projection=getGardenProjection(placement.itemId,placement.slotId,city.id);
    sprite.anchor.set(projection.anchorX,projection.anchorY);
    sprite.width=projection.width*city.world.width;
    sprite.height=projection.height*city.world.height;
    sprite.position.set(projection.x*city.world.width,projection.y*city.world.height);
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
    const height=route.height ?? (route.kind==='caravan'?(city.id==='portrait'?27:22):(city.id==='portrait'?18:14));
    const bounds=actorBounds[route.kind][0];
    const scale=height/(bounds[3]-bounds[1]);
    sprite.scale.set(scale);
    const turn=new Sprite(textures[0]);
    turn.label=`city-turn-${route.kind}-${index}`;
    turn.scale.set(scale);turn.alpha=0;
    const shadow=new Graphics();
    shadow.ellipse(0,0,height*.23,height*.065).fill({color:colors.dust,alpha:.17});
    shadow.label=`city-foot-shadow-${index}`;
    layer.addChild(shadow,sprite,turn);
    return [{sprite,turn,shadow,route,textures,scale}];
  });
  city.palms.flatMap((point,index)=>{
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
    return [sprite];
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
  glints.label='city-atmosphere';
  glints.zIndex=city.world.height+1;
  layer.addChild(glints);
  let frozenElapsed=initialElapsed;
  const update=(elapsed:number,animate:boolean,npcs=true)=>{
    if(animate)frozenElapsed=elapsed;
    const time=frozenElapsed;
    for (const actor of actors) {
      const point=cityActorPosition(actor.route,time,city.world);
      const frame=Math.floor(point.gait*4)%4;
      const bounds=actorBounds[actor.route.kind][frame];
      for(const sprite of [actor.sprite,actor.turn]){
        sprite.visible=npcs;
        sprite.position.set(point.x,point.y);
        sprite.zIndex=point.y;
        sprite.texture=actor.textures[frame];
        sprite.anchor.set((bounds[0]+bounds[2])/2/sprite.texture.width,bounds[3]/sprite.texture.height);
      }
      actor.sprite.scale.x=actor.scale*point.heading;
      actor.turn.scale.x=-actor.scale*point.heading;
      actor.sprite.alpha=1-point.turnMix;
      actor.turn.alpha=point.turnMix;
      actor.shadow.visible=npcs;
      actor.shadow.position.set(point.x,point.y);
      actor.shadow.zIndex=point.y-.01;
    }
    for (const item of environment) item.sprite.texture=item.textures[Math.floor((time+item.offset)/360)%4];
    // Palm clusters include their ground; rotating the full raster lifts roots.
    water?.update(time,animate);
    glints.clear();
    if (!animate || !quality.environment) return;
    if (quality.particles) for(let index=0;index<5;index++) {
      const phase=(elapsed/15000+index*.173)%1;
      glints.circle((.47+index*.013)*city.world.width,(.61-phase*.025)*city.world.height,1).fill({color:colors.dust,alpha:Math.sin(phase*Math.PI)*.13});
    }
  };
  update(initialElapsed,false);
  return {layer,actorCount:actors.length,update,destroy:()=>{water?.destroy();layer.destroy({children:true});owned.forEach(texture=>texture.destroy());ownedColors.forEach(texture=>texture.destroy(true));frames.clear();}};
}

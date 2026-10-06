import { Sprite, Texture, TextureSource } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { getCityComposition, cityGardenPlacements } from '@/lib/kingdoms/village/city-composition';
import { resolveVillageQuality } from '@/lib/kingdoms/village/quality';
import { gardenAsset } from '@/lib/kingdoms/palace-garden';
import { createCityLifeLayer, cityLifeAssets } from './city-life-layer';

const colors={gold:'gold',light:'white',water:'white',dust:'gold'};
const assets=()=>new Map<string,Texture>(Object.values(cityLifeAssets).map(src=>[src,new Texture({source:new TextureSource({width:1024,height:512})})]));

describe('actual city life sprites',()=>{
  it('moves actors through authored roads and freezes their pose and position when motion is disabled',()=>{
    const approved=assets();
    const city=getCityComposition({width:1440,height:900});
    const layer=createCityLifeLayer(city,approved,resolveVillageQuality('high',{width:1440,dpr:1}),colors);
    const guard=layer.layer.children.find(child=>child.label==='city-actor-guard-0') as Sprite;
    expect(guard).toBeInstanceOf(Sprite);
    layer.update(1000,true);
    const initial={x:guard.x,y:guard.y};
    layer.update(5000,true);
    expect({x:guard.x,y:guard.y}).not.toEqual(initial);
    const stopped={x:guard.x,y:guard.y,texture:guard.texture};
    layer.update(20000,false);
    expect({x:guard.x,y:guard.y,texture:guard.texture}).toEqual(stopped);
    layer.destroy();
    expect([...approved.values()].every(texture=>!texture.destroyed)).toBe(true);
  });

  it('respects a zero actor budget and renders only validated owned garden slots',()=>{
    const approved=assets();
    approved.set(gardenAsset('red-roses',{thumbnail:true}),new Texture({source:new TextureSource({width:128,height:128})}));
    const quality={...resolveVillageQuality('low',{width:390,dpr:1}),npcLimit:0};
    const slots=cityGardenPlacements({palaceGarden:{slots:[{slotId:0,itemId:'red-roses'}]}});
    const layer=createCityLifeLayer(getCityComposition({width:390,height:844}),approved,quality,colors,slots);
    expect(layer.layer.children.some(child=>child.label.startsWith('city-actor'))).toBe(false);
    expect(layer.layer.children.filter(child=>child.label.startsWith('city-owned-garden'))).toHaveLength(1);
    expect(cityGardenPlacements({})).toEqual([]);
    expect(cityGardenPlacements({palaceGarden:{slots:[{slotId:99,itemId:'fake'}]}})).toEqual([]);
    layer.destroy();
  });
});

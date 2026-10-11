import { Assets, Texture, TextureSource, Container, Rectangle, EventBoundary, FederatedPointerEvent } from 'pixi.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import { createCamera } from '@/lib/kingdoms/village/cameraMath';
import { resolveVillageQuality } from '@/lib/kingdoms/village/quality';
import type { VillageCanvasProps } from '@/lib/kingdoms/village/types';
import { createVillageRenderer } from './village-renderer';
import { getCityComposition, sultanGardenEntranceRect } from '@/lib/kingdoms/village/city-composition';

const gpu=vi.hoisted(()=>({stage:null as Container|null,tickerStart:vi.fn(),tickerStop:vi.fn()}));
vi.mock('pixi.js',async(importOriginal)=>{
  const actual=await importOriginal<typeof import('pixi.js')>();
  return {...actual,Assets:{load:vi.fn(async()=>new actual.Texture({source:new actual.TextureSource({width:1024,height:512})}))},Application:class {
    stage=new actual.Container();
    ticker={add:vi.fn(),start:gpu.tickerStart,stop:gpu.tickerStop,maxFPS:0};
    renderer={resize:vi.fn()};
    init=vi.fn(async()=>{gpu.stage=this.stage;});
    render=vi.fn();
    destroy(){this.stage.destroy({children:true});}
  }};
});
const loadTexture:(src:string)=>Promise<Texture>=Assets.load;
beforeEach(()=>{vi.clearAllMocks();vi.mocked(loadTexture).mockImplementation(async()=>new Texture({source:new TextureSource({width:1024,height:512})}));});
function pointer(x:number,y:number,id=1) {const event=new FederatedPointerEvent(new EventBoundary());event.global.set(x,y);event.pointerId=id;return event;}
function fixture():VillageCanvasProps {
  const now=1800000000000;
  const view=projectWorld(executeCommand(createWorld(now),'p',{type:'found',name:'اختبار'},now),'p',now);
  return {view,village:view.villages[0],selected:null,onSelect:vi.fn(),quality:'low',reducedMotion:true,showLabels:false,cityComposition:'portrait'};
}
const colors={gold:'gold',light:'white',water:'white',dust:'gold'};

describe('Pixi city hub interaction',()=>{
  it.each(['desktop','portrait'] as const)('excludes vacant %s courtyards from enlarged touch targets at every camera scale',async composition=>{
    const props={...fixture(),cityComposition:composition,onFacilitySelect:vi.fn()};
    const renderer=await createVillageRenderer(document.createElement('canvas'),props,resolveVillageQuality('low',{width:320,dpr:1}),colors,{onSelect:vi.fn(),onGardenSelect:vi.fn()});
    const city=getCityComposition(composition==='desktop'?{width:1600,height:900}:{width:900,height:1600});
    const hits=gpu.stage!.children[0].children.find(child=>child.label==='city-landmark-interactions') as Container;
    for(const scale of [.12,.2,.3,.5,1,2]) {
      hits.children.forEach(hit=>hit.emit('city-camera-scale',scale));
      for(const site of city.landmarks.filter(item=>item.classification==='reserved')) {
        for(const [dx,dy] of [[0,0],[.5,.5],[1,1],[0,1],[1,0]]) {
          expect(hits.children.some(hit=>(hit.hitArea as Rectangle).contains(site.rect.x+site.rect.width*dx,site.rect.y+site.rect.height*dy))).toBe(false);
        }
      }
    }
    renderer.destroy();
  });
  it.each(['desktop','portrait'] as const)('routes the %s garden as a facility while preserving building centers and gesture cancellation',async composition=>{
    const onSelect=vi.fn(), onGardenSelect=vi.fn();
    const props={...fixture(),cityComposition:composition,onFacilitySelect:vi.fn()};
    const renderer=await createVillageRenderer(document.createElement('canvas'),props,resolveVillageQuality('low',{width:320,dpr:1}),colors,{onSelect,onGardenSelect});
    const city=getCityComposition(composition==='desktop'?{width:1600,height:900}:{width:900,height:1600});
    const hits=gpu.stage!.children[0].children.find(child=>child.label==='city-landmark-interactions') as Container;
    const garden=hits.children.find(hit=>hit.label==='city-hit-sultan-garden')!;
    const rect=sultanGardenEntranceRect(composition);
    for(const scale of [.12,.2,.3,.5,1,2]) {
      garden.emit('city-camera-scale',scale);
      const area=garden.hitArea as Rectangle;
      expect(area.width*scale).toBeGreaterThanOrEqual(48);
      expect(area.height*scale).toBeGreaterThanOrEqual(48);
      expect(area.contains(rect.x+rect.width/2,rect.y+rect.height/2)).toBe(true);
      for(const building of city.landmarks.filter(item=>item.target&&item.id!=='citadel')) {
        expect(area.contains(building.rect.x+building.rect.width/2,building.rect.y+building.rect.height/2)).toBe(false);
      }
    }
    garden.emit('pointerdown',pointer(100,100)); garden.emit('pointertap',pointer(101,100));
    expect(onGardenSelect).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
    garden.emit('pointerdown',pointer(100,100)); garden.emit('globalpointermove',pointer(130,100)); garden.emit('pointertap',pointer(100,100));
    expect(onGardenSelect).toHaveBeenCalledOnce();
    garden.emit('pointerdown',pointer(100,100,2)); garden.emit('pointerdown',pointer(101,100,3));
    garden.emit('pointertap',pointer(100,100,2)); garden.emit('pointertap',pointer(101,100,3));
    expect(onGardenSelect).toHaveBeenCalledOnce();
    renderer.destroy();
  });
  it('selects palace from native Pixi hit areas, suppresses drags and preserves accessible touch size',async()=>{
    const now=1800000000000;
    const view=projectWorld(executeCommand(createWorld(now),'p',{type:'found',name:'اختبار'},now),'p',now);
    const props:VillageCanvasProps={view,village:view.villages[0],selected:null,onSelect:vi.fn(),quality:'low',reducedMotion:true,showLabels:false,cityComposition:'portrait'};
    const onSelect=vi.fn();
    const canvas=document.createElement('canvas');
    const renderer=await createVillageRenderer(canvas,props,resolveVillageQuality('low',{width:390,dpr:1}),{gold:'gold',light:'white',water:'white',dust:'gold'},{onSelect});
    const world=gpu.stage!.children[0];
    const hits=world.children.find(child=>child.label==='city-landmark-interactions') as Container;
    const palace=hits.children.find(child=>child.label==='city-hit-hall')!;
    expect(palace.eventMode).toBe('static');
    palace.emit('pointerdown',pointer(100,100));
    palace.emit('pointertap',pointer(102,100));
    expect(onSelect).toHaveBeenCalledWith('hall');
    palace.emit('pointerdown',pointer(100,100));
    palace.emit('pointertap',pointer(130,100));
    expect(onSelect).toHaveBeenCalledOnce();
    const camera=createCamera({width:390,height:650},false,{width:900,height:1600});
    renderer.camera(camera);
    expect(hits.children.some(child=>child.label==='city-hit-blacksmith')).toBe(false);
    expect(hits.children.some(child=>child.label==='city-hit-knowledge')).toBe(false);
    const granary=hits.children.find(child=>child.label==='city-hit-granary')!.hitArea as Rectangle;
    expect(granary.width*camera.scale).toBeGreaterThanOrEqual(44);
    expect(granary.height*camera.scale).toBeGreaterThanOrEqual(44);
    renderer.setVisible(false);
    palace.emit('pointerdown',pointer(100,100));
    palace.emit('pointertap',pointer(100,100));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(gpu.tickerStop).toHaveBeenCalled();
    await vi.waitFor(()=>expect(Number(canvas.dataset.cityActors)).toBeGreaterThan(0));
    renderer.destroy();
    expect(world.destroyed).toBe(true);
  });
  it('rejects returning drags and pinch gestures even when the final tap is near the start',async()=>{
    const onSelect=vi.fn();
    const renderer=await createVillageRenderer(document.createElement('canvas'),fixture(),resolveVillageQuality('low',{width:390,dpr:1}),colors,{onSelect});
    const hits=gpu.stage!.children[0].children.find(child=>child.label==='city-landmark-interactions') as Container;
    const palace=hits.children.find(child=>child.label==='city-hit-hall')!;
    palace.emit('pointerdown',pointer(100,100));
    palace.emit('globalpointermove',pointer(130,100));
    palace.emit('globalpointermove',pointer(101,100));
    palace.emit('pointertap',pointer(101,100));
    expect(onSelect).not.toHaveBeenCalled();
    palace.emit('pointerdown',pointer(100,100,2));
    palace.emit('pointerdown',pointer(101,100,3));
    palace.emit('pointertap',pointer(100,100,2));
    palace.emit('pointertap',pointer(101,100,3));
    expect(onSelect).not.toHaveBeenCalled();
    renderer.destroy();
  });
  it('creates interactions before optional assets resolve and requests only assets allowed by the current quality',async()=>{
    let resolve!: (texture:Texture)=>void;
    vi.mocked(loadTexture).mockImplementation(()=>new Promise<Texture>(done=>{resolve=done;}));
    const canvas=document.createElement('canvas');
    const props=fixture();
    const empty={...resolveVillageQuality('low',{width:390,dpr:1}),npcLimit:0};
    const onSelect=vi.fn();
    const renderer=await createVillageRenderer(canvas,props,empty,colors,{onSelect});
    expect(Assets.load).not.toHaveBeenCalled();
    expect(Number(canvas.dataset.cityInteractions)).toBeGreaterThan(0);
    renderer.update(props,{...empty,npcLimit:1});
    expect(vi.mocked(Assets.load).mock.calls.map(([src])=>src)).toEqual(['/game-art/kingdoms/city-hub/guard-walk-atlas.webp']);
    const hits=gpu.stage!.children[0].children.find(child=>child.label==='city-landmark-interactions') as Container;
    const palace=hits.children.find(child=>child.label==='city-hit-hall')!;
    palace.emit('pointerdown',pointer(100,100));palace.emit('pointertap',pointer(100,100));
    expect(onSelect).toHaveBeenCalledWith('hall');
    renderer.update({...props,cityComposition:'desktop'},empty);
    resolve(new Texture({source:new TextureSource({width:1024,height:512})}));
    await Promise.resolve();await Promise.resolve();
    expect(Number(canvas.dataset.cityActors)).toBe(0);
    renderer.destroy();
  });
});

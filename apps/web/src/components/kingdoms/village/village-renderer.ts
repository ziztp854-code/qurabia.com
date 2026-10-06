// Replace generated shader/uniform functions with static implementations for production CSP.
import 'pixi.js/unsafe-eval';
import { Application, Assets, Container, Graphics, Rectangle, type FederatedPointerEvent, type AnimatedSprite, type Texture } from 'pixi.js';
import {
  resolveVillageAssetSrc,
  villageAssetFidelity,
  villageAssets,
  type VillageAssetSlot,
} from '@/lib/kingdoms/village/assetManifest';
import { getVillageVisualLevel, villageBuildingRegistry } from '@/lib/kingdoms/village/buildingRegistry';
import { getBuildingRect, rectCenter } from '@/lib/kingdoms/village/coordinates';
import type { QualitySettings } from '@/lib/kingdoms/village/quality';
import type {
  CameraSnapshot,
  VillageCanvasProps,
  VillageSelection,
  VillageTarget,
  WorldPoint,
  WorldSize,
} from '@/lib/kingdoms/village/types';
import { getCityComposition, cityGardenPlacements, type CityCompositionId } from '@/lib/kingdoms/village/city-composition';
import { gardenAsset } from '@/lib/kingdoms/palace-garden';
import { createCityLifeLayer, cityLifeAssets } from './city-life-layer';
import { buildingKeys } from '@/lib/kingdoms/types';
import {
  createArtworkTextureCache,
  createBuildingLayer,
  createEnvironmentLayer,
  createConstructionAssetLayer,
  createNPCLayer,
  createRoadLayer,
  collectAssetAnimations,
  paintConstruction,
  paintEnvironment,
  paintInteraction,
  type SceneColors,
} from './village-layers';

export type VillageRenderer = {
  camera: (snapshot: CameraSnapshot) => void;
  update: (props: VillageCanvasProps, quality: QualitySettings) => void;
  hover: (building: VillageSelection | null) => void;
  targetHover?: (target: VillageTarget | null) => void;
  setVisible: (visible: boolean) => void;
  destroy: () => void;
};

export async function createVillageRenderer(
  canvas: HTMLCanvasElement,
  initial: VillageCanvasProps,
  quality: QualitySettings,
  colors: SceneColors,
  interaction?: { onSelect: (target: VillageTarget) => void; onHover?: (target: VillageTarget | null) => void },
): Promise<VillageRenderer> {
  if (initial.cityComposition) return createCityHubRenderer(canvas, initial, quality, colors, interaction);
  const app = new Application();
  let viewport: WorldSize = {
    width: canvas.parentElement?.clientWidth || 768,
    height: canvas.parentElement?.clientHeight || 512,
  };
  let surfaceDpr = quality.dpr;
  try {
    await app.init({
      canvas,
      width: viewport.width,
      height: viewport.height,
      backgroundAlpha: 0,
      antialias: false,
      resolution: quality.dpr,
      autoStart: false,
      sharedTicker: false,
      powerPreference: quality.mode === 'low' ? 'low-power' : 'high-performance',
    });
  } catch (error) {
    if (app.renderer) app.destroy(false, { children: true });
    throw error;
  }
  let source: Texture;
  const cropPlate = resolveVillageAssetSrc(villageAssets.base, 'standard') ?? villageAssets.base.src;
  try {
    // Overlay crops use the 1536×1024 plate. Hidpi and ultra stay on the DOM terrain image.
    source = await Assets.load<Texture>(cropPlate);
  } catch (error) {
    app.destroy(false, { children: true });
    throw error;
  }
  const world = new Container();
  app.stage.addChild(world);
  let props = initial;
  let settings = quality;
  let textures: Texture[] = [];
  const artwork = createArtworkTextureCache(source);
  const approved = new Map<string, Texture>();
  const pending = new Map<string, Promise<Texture>>();
  // IDs and counts are bounded by the visual NPC budget; reuse figures across snapshots.
  const npcPool = new Map<string, Container>();
  let buildingLayer: Container;
  let roadLayer: Container;
  let constructionLayer: Container;
  let assetAnimations: AnimatedSprite[] = [];
  let npcs: ReturnType<typeof createNPCLayer>;
  let environment: ReturnType<typeof createEnvironmentLayer>;
  const effects = new Graphics();
  const interactions = new Graphics();
  let hovered: VillageSelection | null = null;
  let elapsed = 0;
  let visible = true;
  let disposed = false;
  let completed: readonly WorldPoint[] = [];
  let completionUntil = 0;
  const resizeSurface = (nextViewport: WorldSize = viewport) => {
    if (
      nextViewport.width === viewport.width &&
      nextViewport.height === viewport.height &&
      settings.dpr === surfaceDpr
    )
      return;
    app.renderer.resize(nextViewport.width, nextViewport.height, settings.dpr);
    viewport = { ...nextViewport };
    surfaceDpr = settings.dpr;
  };

  const loadApprovedAssets = async (next: VillageCanvasProps, nextSettings: QualitySettings) => {
    let changed = false;
    const buildingSlots: VillageAssetSlot[] = villageBuildingRegistry.flatMap(({ id }) => {
      const tier = getVillageVisualLevel(id, next.village, next.debug);
      return tier > 0 ? [villageAssets.buildings[id][tier - 1]] : [];
    });
    const slots: VillageAssetSlot[] = [
      ...buildingSlots,
      villageAssets.roads,
      ...(next.village.build ? [villageAssets.environment.scaffold] : []),
      ...Object.values(villageAssets.npc),
      ...(nextSettings.environment ? Object.values(villageAssets.environment) : []),
    ];
    const fidelity = villageAssetFidelity(nextSettings.mode);
    const terrainPlate = resolveVillageAssetSrc(villageAssets.base, fidelity);
    const standardPlate = resolveVillageAssetSrc(villageAssets.base, 'standard');
    const sources = [
      ...new Set(
        slots.flatMap((slot) => {
          const src = resolveVillageAssetSrc(slot, fidelity);
          return [...(src ? [src] : []), ...slot.frames];
        }),
      ),
    ].filter((src) => src === standardPlate || src !== terrainPlate);
    await Promise.all(
      sources.map(async (src) => {
        if (approved.has(src)) return;
        let loading = pending.get(src);
        if (!loading) {
          loading = Assets.load<Texture>(src);
          pending.set(src, loading);
        }
        try {
          const texture = await loading;
          if (!disposed && approved.get(src) !== texture) {
            approved.set(src, texture);
            changed = true;
          }
        } catch {
          /* Missing optional artwork retains the documented original-art fallback. */
        } finally {
          pending.delete(src);
        }
      }),
    );
    return changed;
  };

  const rebuild = () => {
    if (buildingLayer) {
      world.removeChild(roadLayer, buildingLayer, npcs.layer, environment.layer, constructionLayer, effects, interactions);
      roadLayer.destroy({ children: true });
      buildingLayer.destroy({ children: true });
      npcs.layer.removeChildren();
      npcs.layer.destroy();
      environment.layer.destroy({ children: true });
      constructionLayer.destroy({ children: true });
    }
    textures.forEach((texture) => texture.destroy());
    textures = [];
    const fidelity = villageAssetFidelity(settings.mode);
    roadLayer = createRoadLayer(source, textures, approved, fidelity);
    buildingLayer = createBuildingLayer(source, props, textures, approved, artwork, fidelity);
    npcs = createNPCLayer(source, props, settings, textures, approved, artwork, npcPool);
    environment = createEnvironmentLayer(
      source,
      textures,
      approved,
      props.village.progression?.visualTier,
      fidelity,
    );
    constructionLayer = createConstructionAssetLayer(source, props, textures, approved, fidelity);
    environment.layer.visible = settings.environment;
    world.addChild(roadLayer, buildingLayer, environment.layer, npcs.layer, constructionLayer, effects, interactions);
    assetAnimations = collectAssetAnimations(world);
    paintInteraction(interactions, props, hovered, colors);
    npcs.update(elapsed);
  };
  const animate = () => !props.reducedMotion && props.debug?.animations !== false;
  const syncTicker = () => {
    app.ticker.maxFPS = settings.fps;
    if (visible && animate()) app.ticker.start();
    else app.ticker.stop();
  };
  await loadApprovedAssets(props, settings);
  rebuild();
  app.ticker.add((ticker) => {
    if (disposed || !visible || !animate()) return;
    elapsed += Math.min(100, ticker.deltaMS);
    assetAnimations.forEach((sprite) => sprite.gotoAndStop(Math.floor(elapsed / 140) % sprite.totalFrames));
    if (props.debug?.npcs !== false) npcs.update(elapsed);
    if (settings.environment) {
      paintEnvironment(
        environment.glints,
        elapsed,
        colors,
        settings.particles,
        props.village.progression?.visualTier,
      );
      if (environment.flag && environment.flagSway)
        environment.flag.scale.x = environment.flagScale * (1 + Math.sin(elapsed / 470) * 0.05);
    }
    paintConstruction(
      effects,
      props,
      elapsed,
      colors,
      settings.particles,
      elapsed < completionUntil ? completed : [],
    );
  });
  const render = () => {
    if (!disposed) app.render();
  };
  syncTicker();
  return {
    camera(snapshot) {
      if (disposed) return;
      resizeSurface(snapshot.viewport);
      world.scale.set(snapshot.scale);
      world.position.set(
        snapshot.viewport.width / 2 - snapshot.x * snapshot.scale,
        snapshot.viewport.height / 2 - snapshot.y * snapshot.scale,
      );
      render();
    },
    update(next, nextQuality) {
      if (disposed) return;
      const newlyCompleted = buildingKeys
        .filter((building) => next.village.buildings[building] > props.village.buildings[building])
        .map((building) => rectCenter(getBuildingRect(building, next.debug)));
      if (newlyCompleted.length) {
        completed = newlyCompleted;
        completionUntil = elapsed + 280;
      }
      const rebuildNeeded =
        next.village.id !== props.village.id ||
        next.village.progression?.visualTier !== props.village.progression?.visualTier ||
        JSON.stringify(next.village.buildings) !== JSON.stringify(props.village.buildings) ||
        JSON.stringify(next.village.troops) !== JSON.stringify(props.village.troops) ||
        next.village.build?.building !== props.village.build?.building ||
        next.debug !== props.debug ||
        nextQuality.npcLimit !== settings.npcLimit ||
        nextQuality.mode !== settings.mode;
      props = next;
      settings = nextQuality;
      if (rebuildNeeded) rebuild();
      if (rebuildNeeded)
        void loadApprovedAssets(props, settings).then((changed) => {
          if (!disposed && changed) {
            rebuild();
            render();
          }
        });
      resizeSurface();
      npcs.layer.visible = props.debug?.npcs !== false;
      environment.layer.visible = settings.environment;
      if (!animate()) {
        effects.clear();
        environment.glints.clear();
      }
      paintInteraction(interactions, props, hovered, colors);
      syncTicker();
      render();
    },
    hover(building) {
      hovered = building;
      paintInteraction(interactions, props, hovered, colors);
      render();
    },
    setVisible(next) {
      visible = next;
      syncTicker();
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      app.ticker.stop();
      app.destroy(false, { children: true });
      npcPool.forEach((container) => {
        if (!container.destroyed) container.destroy({ children: true });
      });
      npcPool.clear();
      textures.forEach((texture) => texture.destroy());
      textures = [];
      artwork.destroy();
      approved.clear();
      pending.clear();
    },
  };
}

async function createCityHubRenderer(canvas:HTMLCanvasElement,initial:VillageCanvasProps,quality:QualitySettings,colors:SceneColors,interaction?:{onSelect:(target:VillageTarget)=>void;onHover?:(target:VillageTarget|null)=>void}):Promise<VillageRenderer> {
  const app=new Application();
  let props=initial, settings=quality, disposed=false, visible=initial.active!==false, elapsed=0;
  let viewport={width:canvas.parentElement?.clientWidth||768,height:canvas.parentElement?.clientHeight||512};
  let dpr=settings.dpr;
  try { await app.init({canvas,width:viewport.width,height:viewport.height,resolution:dpr,backgroundAlpha:0,antialias:true,autoStart:false,sharedTicker:false,powerPreference:quality.mode==='low'?'low-power':'high-performance'}); }
  catch(error) { if(app.renderer)app.destroy(false,{children:true});throw error; }
  const world=new Container();
  world.label='city-hub-world';
  app.stage.addChild(world);
  const approved=new Map<string,Texture>();
  const pending=new Map<string,Promise<Texture>>();
  const highlight=new Graphics();
  highlight.label='city-landmark-highlight';
  const hits=new Container();
  hits.label='city-landmark-interactions';
  let hovered:VillageTarget|null=null;
  let composition=initial.cityComposition as CityCompositionId;
  let life:ReturnType<typeof createCityLifeLayer>|undefined;
  let hitScale=1;
  type Gesture = { x:number; y:number; maximum:number; cancelled:boolean; ended:boolean };
  const gestures=new Map<number,Gesture>();
  const beginGesture=(id:number,x:number,y:number)=>{
    if(gestures.has(id))return;
    if(gestures.size>=10){gestures.forEach(gesture=>{gesture.cancelled=true;});return;}
    gestures.set(id,{x,y,maximum:0,cancelled:!visible||disposed,ended:false});
    if(gestures.size>1)gestures.forEach(gesture=>{gesture.cancelled=true;});
  };
  const moveGesture=(id:number,x:number,y:number)=>{
    const gesture=gestures.get(id);
    if(!gesture||gesture.ended)return;
    gesture.maximum=Math.max(gesture.maximum,Math.hypot(x-gesture.x,y-gesture.y));
    if(gesture.maximum>6)gesture.cancelled=true;
  };
  const eventPoint=(event:FederatedPointerEvent)=>{
    const native=event.nativeEvent;
    return native && 'clientX' in native ? {x:native.clientX,y:native.clientY} : event.global;
  };
  const nativeDown=(event:PointerEvent)=>{
    if(event.button!==0&&event.pointerType!=='touch')return;
    if(event.target===canvas||gestures.size)beginGesture(event.pointerId,event.clientX,event.clientY);
  };
  const nativeMove=(event:PointerEvent)=>moveGesture(event.pointerId,event.clientX,event.clientY);
  const nativeEnd=(event:PointerEvent)=>{
    moveGesture(event.pointerId,event.clientX,event.clientY);
    const gesture=gestures.get(event.pointerId);
    if(!gesture)return;
    gesture.ended=true;
    if(event.type==='pointercancel'||event.target!==canvas)gesture.cancelled=true;
    // Pixi emits pointertap synchronously during pointerup; remove abandoned gestures afterwards.
    queueMicrotask(()=>{if(gestures.get(event.pointerId)===gesture)gestures.delete(event.pointerId);});
  };
  document.addEventListener('pointerdown',nativeDown,true);
  document.addEventListener('pointermove',nativeMove,true);
  document.addEventListener('pointerup',nativeEnd,true);
  document.addEventListener('pointercancel',nativeEnd,true);
  const city=()=>getCityComposition(composition==='portrait'?{width:900,height:1600}:{width:1600,height:900});
  const paint=()=>{
    highlight.clear();
    const landmark=city().landmarks.find(item=>item.target===hovered);
    if(landmark)highlight.roundRect(landmark.rect.x,landmark.rect.y,landmark.rect.width,landmark.rect.height,8)
      .fill({color:colors.gold,alpha:.055}).stroke({color:colors.gold,alpha:.75,width:1.7});
  };
  const rebuildLife=()=>{
    life?.destroy();
    life=createCityLifeLayer(city(),approved,settings,colors,cityGardenPlacements(props.village));
    world.addChildAt(life.layer,0);
    life.update(elapsed,false,props.debug?.npcs!==false);
    canvas.dataset.cityActors=String(life.layer.children.filter(child=>child.label.startsWith('city-actor')).length);
  };
  const rebuild=()=>{
    gestures.clear();
    hits.removeChildren().forEach(child=>child.destroy());
    world.addChild(hits,highlight);
    rebuildLife();
    for(const landmark of city().landmarks) {
      if(!landmark.target)continue;
      const hit=new Container();
      hit.label=`city-hit-${landmark.id}`;
      hit.eventMode='static';
      hit.cursor='pointer';
      const hitArea=new Rectangle(landmark.rect.x,landmark.rect.y,landmark.rect.width,landmark.rect.height);
      hit.hitArea=hitArea;
      hit.on('city-camera-scale',(scale:number)=>{
        const min=44/Math.max(.001,scale),w=Math.max(min,landmark.rect.width),h=Math.max(min,landmark.rect.height);
        const size=city().world;
        hitArea.width=Math.min(size.width,w);hitArea.height=Math.min(size.height,h);
        hitArea.x=Math.max(0,Math.min(size.width-hitArea.width,landmark.rect.x+landmark.rect.width/2-hitArea.width/2));
        hitArea.y=Math.max(0,Math.min(size.height-hitArea.height,landmark.rect.y+landmark.rect.height/2-hitArea.height/2));
      });
      hit.emit('city-camera-scale',hitScale);
      hit.on('pointerdown',event=>{const point=eventPoint(event);beginGesture(event.pointerId,point.x,point.y);});
      hit.on('globalpointermove',event=>{const point=eventPoint(event);moveGesture(event.pointerId,point.x,point.y);});
      hit.on('pointerupoutside',event=>{const gesture=gestures.get(event.pointerId);if(gesture)gesture.cancelled=true;});
      hit.on('pointercancel',event=>{const gesture=gestures.get(event.pointerId);if(gesture)gesture.cancelled=true;});
      hit.on('pointertap',event=>{
        const point=eventPoint(event);
        moveGesture(event.pointerId,point.x,point.y);
        const gesture=gestures.get(event.pointerId);
        gestures.delete(event.pointerId);
        if(!visible||disposed||!gesture||gesture.cancelled||gesture.maximum>6)return;
        interaction?.onSelect(landmark.target!);
      });
      hit.on('pointerover',()=>{hovered=landmark.target!;paint();interaction?.onHover?.(hovered);});
      hit.on('pointerout',()=>{hovered=null;paint();interaction?.onHover?.(null);});
      hits.addChild(hit);
    }
    paint();
    canvas.dataset.cityInteractions=String(hits.children.length);
  };
  const animate=()=>!props.reducedMotion&&props.debug?.animations!==false;
  const sync=()=>{app.ticker.maxFPS=settings.fps;if(visible&&animate())app.ticker.start();else app.ticker.stop();};
  const render=()=>{if(!disposed)app.render();};
  const loadLifeAssets=()=>{
    const sources=[...new Set([
      ...city().routes.slice(0,Math.max(0,settings.npcLimit)).map(route=>cityLifeAssets[route.kind]),
      ...(settings.environment?[cityLifeAssets.palmA,cityLifeAssets.palmB,cityLifeAssets.flags]:[]),
      ...cityGardenPlacements(props.village).map(item=>gardenAsset(item.itemId,{thumbnail:true})),
    ])];
    void Promise.all(sources.map(async src=>{
      if(approved.has(src))return false;
      let loading=pending.get(src);
      if(!loading){loading=Assets.load<Texture>(src);pending.set(src,loading);}
      try {
        const texture=await loading;
        if(disposed)return false;
        approved.set(src,texture);
        return true;
      } catch {return false;} finally {if(pending.get(src)===loading)pending.delete(src);}
    })).then(changed=>{
      // Read current props/profile/quality, never the snapshot that started the asset request.
      if(!disposed&&changed.some(Boolean)){rebuildLife();render();}
    });
  };
  rebuild();
  loadLifeAssets();
  app.ticker.add(ticker=>{
    if(disposed||!visible||!animate())return;
    elapsed+=Math.min(100,ticker.deltaMS);
    life?.update(elapsed,true,props.debug?.npcs!==false);
  });
  sync();
  return {
    camera(snapshot){
      if(disposed)return;
      if(viewport.width!==snapshot.viewport.width||viewport.height!==snapshot.viewport.height||dpr!==settings.dpr) {
        app.renderer.resize(snapshot.viewport.width,snapshot.viewport.height,settings.dpr);viewport=snapshot.viewport;dpr=settings.dpr;
      }
      world.scale.set(snapshot.scale);world.position.set(snapshot.viewport.width/2-snapshot.x*snapshot.scale,snapshot.viewport.height/2-snapshot.y*snapshot.scale);render();
      hitScale=snapshot.scale;
      hits.children.forEach(hit=>hit.emit('city-camera-scale',hitScale));
    },
    update(next,nextSettings){
      if(disposed)return;
      const gardenChanged=JSON.stringify(cityGardenPlacements(next.village))!==JSON.stringify(cityGardenPlacements(props.village));
      const changed=next.cityComposition!==composition||nextSettings.npcLimit!==settings.npcLimit||nextSettings.environment!==settings.environment||gardenChanged;
      props=next;settings=nextSettings;composition=next.cityComposition??composition;
      if(changed)rebuild();
      if(changed)loadLifeAssets();
      life?.update(elapsed,animate(),props.debug?.npcs!==false);sync();render();
    },
    hover(target){hovered=target;paint();render();},
    targetHover(target){hovered=target;paint();render();},
    setVisible(next){visible=next;if(!next)gestures.forEach(gesture=>{gesture.cancelled=true;});sync();},
    destroy(){
      if(disposed)return;
      disposed=true;app.ticker.stop();life?.destroy();app.destroy(false,{children:true});approved.clear();pending.clear();gestures.clear();
      document.removeEventListener('pointerdown',nativeDown,true);
      document.removeEventListener('pointermove',nativeMove,true);
      document.removeEventListener('pointerup',nativeEnd,true);
      document.removeEventListener('pointercancel',nativeEnd,true);
    },
  };
}

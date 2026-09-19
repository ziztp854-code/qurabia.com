'use client';

import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { ModelDefinition } from '@/config/models';

export type ModelAnimationControls = Readonly<{
  play: (name?: string) => void;
  pause: () => void;
  stop: () => void;
  crossFade: (name: string, seconds?: number) => void;
  setLoop: (enabled: boolean) => void;
}>;

type ModelLoaderProps = Readonly<{
  model: ModelDefinition;
  src: string;
  hovered: boolean;
  pitch: number;
  yaw: number;
  zoom: number;
  reducedMotion: boolean;
  goldTone: 'royal' | 'ivory';
  textureUrl?: string;
  onSelect?: (name: string) => void;
  onAnimations: (names: string[]) => void;
  onError: (message: string) => void;
  onProgress: (value: number) => void;
  onReady: () => void;
}>;

// Each loader owns its GLTF instance, including its geometries, textures and skeletons.
function disposeScene(scene: THREE.Object3D) {
  const resources = new Set<{ dispose: () => void }>();
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    resources.add(object.geometry);
    if (object instanceof THREE.SkinnedMesh) resources.add(object.skeleton);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      resources.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) resources.add(value);
    }
  });
  for (const resource of resources) resource.dispose();
}

type LoadedModel = { gltf: GLTF; center: THREE.Vector3; size: THREE.Vector3 };

export const ModelLoader = forwardRef<ModelAnimationControls, ModelLoaderProps>(function ModelLoader(
  { model, src, hovered, pitch, yaw, zoom, reducedMotion, goldTone, textureUrl, onSelect, onAnimations, onError, onProgress, onReady },
  forwardedRef,
) {
  const gl = useThree((state) => state.gl);
  const viewport = useThree((state) => state.viewport);
  const invalidate = useThree((state) => state.invalidate);
  const group = useRef<THREE.Group>(null);
  const mixer = useRef<THREE.AnimationMixer | null>(null);
  const activeAction = useRef<THREE.AnimationAction | null>(null);
  const loop = useRef(true);
  const [loaded, setLoaded] = useState<LoadedModel | null>(null);

  useEffect(() => {
    let active = true;
    let asset: GLTF | undefined;
    const draco = new DRACOLoader().setDecoderPath('/3d/draco/').setWorkerLimit(2);
    const ktx2 = new KTX2Loader().setTranscoderPath('/3d/basis/').setWorkerLimit(2).detectSupport(gl);
    const loader = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
    onProgress(0);
    loader.load(src, (gltf) => {
      if (!active) { disposeScene(gltf.scene); return; }
      asset = gltf;
      const bounds = new THREE.Box3().setFromObject(gltf.scene);
      if (bounds.isEmpty()) { onError('المجسم لا يحتوي على هندسة قابلة للعرض.'); return; }
      gltf.scene.traverse((object) => {
        if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; }
      });
      mixer.current = new THREE.AnimationMixer(gltf.scene);
      setLoaded({ gltf, center: bounds.getCenter(new THREE.Vector3()), size: bounds.getSize(new THREE.Vector3()) });
      onAnimations(gltf.animations.map((clip) => clip.name));
      onProgress(100);
      onReady();
      invalidate();
    }, (event) => {
      if (active) onProgress(event.total > 0 ? Math.round((event.loaded / event.total) * 100) : 0);
    }, () => {
      if (active) onError('تعذر تحميل GLB أو أحد ملفاته. أعد التصدير وتحقق من ملفات Draco وKTX2 عند استخدامها.');
    });
    return () => {
      active = false;
      mixer.current?.stopAllAction();
      if (asset) { mixer.current?.uncacheRoot(asset.scene); disposeScene(asset.scene); }
      mixer.current = null;
      activeAction.current = null;
      draco.dispose();
      ktx2.dispose();
    };
  }, [gl, invalidate, onAnimations, onError, onProgress, onReady, src]);

  useEffect(() => {
    if (!loaded) return;
    // WebGL PBR colors mirror the brand metals; CSS custom properties cannot be passed to Three.
    const color = new THREE.Color(goldTone === 'royal' ? '#d4af37' : '#e7d8b0');
    loaded.gltf.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material instanceof THREE.MeshStandardMaterial && material.name === 'Card_Gold') material.color.copy(color);
      }
    });
    invalidate();
  }, [goldTone, invalidate, loaded]);

  useEffect(() => {
    if (!loaded || !textureUrl) return;
    let active = true;
    const originals = new Map<THREE.MeshStandardMaterial, THREE.Texture | null>();
    const texture = new THREE.TextureLoader().load(textureUrl, (value) => {
      if (!active) { value.dispose(); return; }
      value.colorSpace = THREE.SRGBColorSpace;
      value.flipY = false;
      loaded.gltf.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (material instanceof THREE.MeshStandardMaterial && material.name === 'Card_Navy') {
            if (!originals.has(material)) originals.set(material, material.map);
            material.map = value;
            material.needsUpdate = true;
          }
        }
      });
      invalidate();
    }, undefined, () => { if (active) onError('تعذر تحميل الصورة البديلة للخامة.'); });
    return () => {
      active = false;
      for (const [material, original] of originals) { material.map = original; material.needsUpdate = true; }
      texture.dispose();
      invalidate();
    };
  }, [invalidate, loaded, onError, textureUrl]);

  const findAction = useCallback((name?: string) => {
    if (!mixer.current || !loaded) return null;
    const clips = loaded.gltf.animations;
    const clip = name ? THREE.AnimationClip.findByName(clips, name) : clips[0];
    return clip ? mixer.current.clipAction(clip) : null;
  }, [loaded]);

  useImperativeHandle(forwardedRef, () => ({
    play(name) {
      const action = findAction(name ?? model.animation);
      if (!action || reducedMotion || !mixer.current) return;
      if (activeAction.current && activeAction.current !== action) activeAction.current.stop();
      mixer.current.timeScale = 1;
      action.clampWhenFinished = true;
      action.setLoop(loop.current ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      if (!action.isRunning()) action.reset();
      action.play();
      activeAction.current = action;
      invalidate();
    },
    pause() { if (mixer.current) mixer.current.timeScale = 0; },
    stop() { mixer.current?.stopAllAction(); activeAction.current = null; invalidate(); },
    crossFade(name, seconds = 0.35) {
      const next = findAction(name);
      if (!next || reducedMotion || !mixer.current || !Number.isFinite(seconds)) return;
      mixer.current.timeScale = 1;
      next.clampWhenFinished = true;
      next.setLoop(loop.current ? THREE.LoopRepeat : THREE.LoopOnce, Infinity).reset().play();
      if (activeAction.current !== next) activeAction.current?.crossFadeTo(next, Math.max(0, seconds), false);
      activeAction.current = next;
      invalidate();
    },
    setLoop(enabled) { loop.current = enabled; activeAction.current?.setLoop(enabled ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); },
  }), [findAction, invalidate, model.animation, reducedMotion]);

  useFrame((_, delta) => {
    if (!reducedMotion) mixer.current?.update(Math.min(delta, 0.05));
    if (!group.current || !loaded) return;
    const fit = Math.min(viewport.width * 0.76 / Math.max(loaded.size.x, loaded.size.z, 0.001), viewport.height * 0.7 / Math.max(loaded.size.y, loaded.size.z, 0.001));
    const scale = fit * model.scale * zoom * (hovered && !reducedMotion ? 1.025 : 1);
    const targetX = model.rotation[0] + pitch;
    const targetY = model.rotation[1] + yaw;
    const amount = reducedMotion ? 1 : 1 - Math.exp(-12 * delta);
    const value = THREE.MathUtils.lerp(group.current.scale.x, scale, amount);
    group.current.scale.setScalar(value);
    group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, targetX, amount);
    group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, targetY, amount);
    group.current.rotation.z = model.rotation[2];
    const moving = Math.abs(value - scale) + Math.abs(group.current.rotation.x - targetX) + Math.abs(group.current.rotation.y - targetY) > 0.0001;
    if (moving || (!reducedMotion && mixer.current?.timeScale && activeAction.current?.isRunning())) invalidate();
  });

  if (!loaded) return null;
  return (
    <group ref={group} position={[...model.position]} onClick={(event: ThreeEvent<MouseEvent>) => { event.stopPropagation(); onSelect?.(event.object.name); }}>
      <group position={loaded.center.clone().multiplyScalar(-1)}>
        <primitive object={loaded.gltf.scene} dispose={null} />
      </group>
    </group>
  );
});

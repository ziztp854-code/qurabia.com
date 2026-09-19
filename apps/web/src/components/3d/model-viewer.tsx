'use client';

import { Canvas, useThree } from '@react-three/fiber';
import { Component, forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { getModel, type ModelId } from '@/config/models';
import { ModelLoader, type ModelAnimationControls } from './model-loader';
import styles from './model-viewer.module.css';

type ModelViewerProps = Readonly<{
  modelId: ModelId;
  compact?: boolean;
  textureUrl?: string;
  environmentUrl?: string;
  onSelect?: (name: string) => void;
}>;

function Environment({ url, onWarning }: { url?: string; onWarning: (message: string) => void }) {
  const gl = useThree((state) => state.gl);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let active = true;
    const generator = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const fallback = generator.fromScene(room, 0.04);
    room.dispose();
    let hdr: THREE.WebGLRenderTarget | undefined;
    // The GPU target must be created after mount and disposed by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTexture(fallback.texture);
    if (url) new RGBELoader().load(url, (source) => {
      if (!active) { source.dispose(); return; }
      hdr = generator.fromEquirectangular(source);
      source.dispose();
      setTexture(hdr.texture);
    }, undefined, () => { if (active) onWarning('تعذر تحميل البيئة الضوئية؛ تُستخدم إضاءة الاستوديو البديلة.'); });
    return () => {
      active = false;
      fallback.dispose();
      hdr?.dispose();
      generator.dispose();
    };
  }, [gl, onWarning, url]);
  return texture ? <primitive object={texture} attach="environment" /> : null;
}

class CanvasBoundary extends Component<{ children: ReactNode; onError: (message: string) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError('تعذر تشغيل العرض ثلاثي الأبعاد على هذا الجهاز.'); }
  render() { return this.state.failed ? null : this.props.children; }
}

function useAdaptive3d() {
  const [settings, setSettings] = useState({ reducedMotion: false, mobile: false });
  useEffect(() => {
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const mobile = matchMedia('(max-width: 48rem)');
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    const sync = () => setSettings({ reducedMotion: motion.matches, mobile: mobile.matches || memory <= 4 || navigator.hardwareConcurrency <= 4 });
    sync();
    motion.addEventListener('change', sync);
    mobile.addEventListener('change', sync);
    return () => {
      motion.removeEventListener('change', sync);
      mobile.removeEventListener('change', sync);
    };
  }, []);
  return settings;
}

function useModelSource(src: string) {
  const [published, setPublished] = useState<{ original: string; src: string } | null>(null);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const abort = new AbortController();
    const key = src.replace(/^\/models\//, '').replace(/\.glb$/, '');
    const check = async () => {
      try {
        const response = await fetch('/models/manifest.json', { cache: 'no-store', signal: abort.signal });
        if (!response.ok) throw new Error('Manifest unavailable');
        const manifest = await response.json();
        const next: unknown = manifest[key]?.src;
        // Only accept local web-safe paths, never arbitrary URLs from a manifest.
        const valid = typeof next === 'string' && /^\/models\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.[a-f0-9]{16}\.glb$/.test(next);
        if (active) setPublished((previous) => previous?.src === next ? previous : { original: src, src: valid ? next : src });
      } catch {
        if (active) setPublished((previous) => previous ?? { original: src, src });
      } finally {
        if (active && process.env.NODE_ENV === 'development') timer = setTimeout(check, 1500);
      }
    };
    void check();
    return () => {
      active = false;
      abort.abort();
      clearTimeout(timer);
    };
  }, [src]);
  return published?.original === src ? published.src : null;
}

export const ModelViewer = forwardRef<ModelAnimationControls, ModelViewerProps>(function ModelViewer(
  { modelId, compact = false, textureUrl, environmentUrl, onSelect },
  forwardedRef,
) {
  const model = getModel(modelId);
  const controls = useRef<ModelAnimationControls>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [animations, setAnimations] = useState<string[]>([]);
  const [hovered, setHovered] = useState(false);
  const [pitch, setPitch] = useState(0);
  const [yaw, setYaw] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [goldTone, setGoldTone] = useState<'royal' | 'ivory'>('royal');
  const [warning, setWarning] = useState('');
  const [retry, setRetry] = useState(0);
  const [looping, setLooping] = useState(true);
  const [selected, setSelected] = useState('');
  const [visible, setVisible] = useState(true);
  const element = useRef<HTMLElement>(null);
  const { mobile: deviceMobile, reducedMotion } = useAdaptive3d();
  const mobile = deviceMobile || model.quality === 'low';
  const src = useModelSource(model.src);

  useEffect(() => { controls.current?.setLoop(looping); }, [ready, looping]);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '80px' });
    if (element.current) observer.observe(element.current);
    return () => observer.disconnect();
  }, []);

  useImperativeHandle(forwardedRef, () => ({
    play: (name) => controls.current?.play(name),
    pause: () => controls.current?.pause(),
    stop: () => controls.current?.stop(),
    crossFade: (name, seconds) => controls.current?.crossFade(name, seconds),
    setLoop: (enabled) => controls.current?.setLoop(enabled),
  }));

  const handleError = useCallback((message: string) => {
    setReady(false);
    setError(message);
  }, []);
  const handleProgress = useCallback((value: number) => {
    setProgress(value);
    if (value === 0) { setReady(false); setError(''); setAnimations([]); }
  }, []);
  const handleReady = useCallback(() => {
    setError('');
    setReady(true);
  }, []);
  const handleAnimations = useCallback((names: string[]) => setAnimations(names), []);

  return (
    <section ref={element} className={`${styles.viewer}${compact ? ` ${styles.compact}` : ''}`} aria-label={`عارض ${model.name}`} aria-busy={!ready && !error} data-model-src={src}>
      <div
        className={styles.stage}
        tabIndex={0}
        aria-label={
          compact
            ? 'اسحب لتدوير البطاقة، واستخدم الأسهم أو زري زائد وناقص للتنقل'
            : 'اسحب لتدوير البطاقة، واستخدم عجلة الفأرة أو زري زائد وناقص للتقريب'
        }
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest('button')) return;
          pointer.current = { x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const previous = pointer.current;
          if (previous) {
            setYaw((value) => value + (event.clientX - previous.x) * 0.008);
            setPitch((value) => THREE.MathUtils.clamp(value + (event.clientY - previous.y) * 0.006, -0.7, 0.7));
            pointer.current = { x: event.clientX, y: event.clientY };
          } else if (!reducedMotion) {
            const bounds = event.currentTarget.getBoundingClientRect();
            setYaw(((event.clientX - bounds.left) / bounds.width - 0.5) * 0.22);
            setPitch(((event.clientY - bounds.top) / bounds.height - 0.5) * 0.12);
          }
        }}
        onPointerUp={(event) => {
          pointer.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => { pointer.current = null; }}
        onLostPointerCapture={() => { pointer.current = null; }}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => {
          pointer.current = null;
          setHovered(false);
          if (!reducedMotion) { setPitch(0); setYaw(0); }
        }}
        onWheel={(event) => setZoom((value) => THREE.MathUtils.clamp(value - event.deltaY * 0.001, 0.72, 1.35))}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') setYaw((value) => value - 0.12);
          else if (event.key === 'ArrowRight') setYaw((value) => value + 0.12);
          else if (event.key === 'ArrowUp') setPitch((value) => Math.max(-0.7, value - 0.1));
          else if (event.key === 'ArrowDown') setPitch((value) => Math.min(0.7, value + 0.1));
          else if (event.key === '+' || event.key === '=') setZoom((value) => Math.min(1.35, value + 0.08));
          else if (event.key === '-') setZoom((value) => Math.max(0.72, value - 0.08));
          else return;
          event.preventDefault();
        }}
      >
        {!error && src && (
          <CanvasBoundary key={`${src}:${retry}`} onError={handleError}>
          <Canvas
            aria-hidden="true"
            camera={{ position: [0, 0.1, 7.2], fov: 38, near: 0.1, far: 40 }}
            dpr={mobile ? [1, 1.1] : [1, 1.5]}
            gl={{ antialias: !mobile, alpha: true, powerPreference: mobile ? 'low-power' : 'high-performance' }}
            frameloop={visible ? 'demand' : 'never'}
            shadows={mobile ? false : 'percentage'}
            fallback={<p>WebGL غير متاح على هذا الجهاز.</p>}
            onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.outputColorSpace = THREE.SRGBColorSpace; }}
          >
            <Environment url={environmentUrl} onWarning={setWarning} />
            <ambientLight intensity={0.34} />
            <spotLight castShadow={!mobile} color="#f2e8d5" intensity={5} position={[3, 5, 6]} penumbra={0.55} shadow-mapSize={[512, 512]} shadow-bias={-0.0001} shadow-normalBias={0.02} shadow-camera-near={0.5} shadow-camera-far={20} />
            <pointLight color="#d4af37" intensity={22} distance={12} position={[-4, 1.5, 3]} />
            <pointLight color="#00d4ff" intensity={6} distance={10} position={[4, -1.5, 2]} />
            <ModelLoader
              ref={controls}
              model={model}
              hovered={hovered}
              pitch={pitch}
              yaw={yaw}
              zoom={zoom}
              reducedMotion={reducedMotion}
              goldTone={goldTone}
              textureUrl={textureUrl}
              src={src}
              onSelect={(name) => { setSelected(name); onSelect?.(name); }}
              onAnimations={handleAnimations}
              onError={handleError}
              onProgress={handleProgress}
              onReady={handleReady}
            />
            {!mobile && (
              <mesh receiveShadow position={[0, -2.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[12, 12]} />
                <shadowMaterial transparent opacity={0.24} />
              </mesh>
            )}
          </Canvas>
          </CanvasBoundary>
        )}
        {!ready && !error && <div className={styles.loading} role="status">تحميل المجسم {progress ? `${progress}%` : '…'}</div>}
        {error && <div className={styles.error} role="alert"><div><p>تعذر تحميل المجسم. {error}</p><button type="button" onClick={() => { setError(''); setReady(false); setRetry((value) => value + 1); }}>إعادة المحاولة</button></div></div>}
      </div>

      {!compact && <div className={styles.controls} aria-label="أدوات المجسم">
        <button type="button" disabled={!ready || !animations.length || reducedMotion} onClick={() => controls.current?.play()}>تشغيل الحركة</button>
        <button type="button" disabled={!ready || !animations.length || reducedMotion} onClick={() => controls.current?.pause()}>إيقاف مؤقت</button>
        <button type="button" disabled={!ready} onClick={() => controls.current?.stop()}>إيقاف</button>
        <button type="button" onClick={() => setZoom((value) => Math.min(1.35, value + 0.08))} aria-label="تقريب">＋</button>
        <button type="button" onClick={() => setZoom((value) => Math.max(0.72, value - 0.08))} aria-label="إبعاد">−</button>
        <button type="button" onClick={() => setGoldTone((value) => value === 'royal' ? 'ivory' : 'royal')}>تبديل الخامة</button>
        <button type="button" aria-pressed={looping} onClick={() => { setLooping(!looping); controls.current?.setLoop(!looping); }}>تكرار الحركة</button>
        <button type="button" onClick={() => { setPitch(0); setYaw(0); setZoom(1); }}>إعادة التركيز</button>
        {animations.length > 1 && <label>الحركة <select aria-label="اختيار الحركة" onChange={(event) => controls.current?.crossFade(event.target.value)}>{animations.map((name) => <option key={name}>{name}</option>)}</select></label>}
      </div>}
      {!compact && <p className={styles.meta}>{animations.length ? `الحركات: ${animations.join('، ')}` : 'المجسم ثابت أو لم يكتمل تحميله بعد.'}</p>}
      {!compact && reducedMotion && <p className={styles.meta}>الحركة التلقائية معطلة وفق تفضيلات جهازك.</p>}
      {!compact && selected && <p className={styles.meta} role="status">العنصر المحدد: <bdi>{selected}</bdi></p>}
      {!compact && warning && <p className={styles.meta} role="status">{warning}</p>}
    </section>
  );
});

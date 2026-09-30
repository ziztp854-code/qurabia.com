'use client';

import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { MathUtils } from 'three';
import type { Building } from '@/lib/kingdoms/types';
import { KingdomSceneGeometry } from './kingdom-scene-geometry';
import type { SceneBuilding } from './kingdom-scene-state';
import styles from './kingdom-scene.module.css';

function Camera({ yaw, pitch, radius }: { yaw: number; pitch: number; radius: number }) {
  const { camera, invalidate } = useThree();
  useEffect(() => {
    camera.position.set(Math.sin(yaw) * radius, Math.sin(pitch) * radius, Math.cos(yaw) * radius);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, invalidate, pitch, radius, yaw]);
  return null;
}

export function KingdomScene3D({ buildings, selected, onSelect }: {
  buildings: SceneBuilding[];
  selected: Building | null;
  onSelect: (building: Building) => void;
}) {
  const [yaw, setYaw] = useState(0.63);
  const [pitch, setPitch] = useState(0.72);
  const [radius, setRadius] = useState(21);
  const pointer = useRef<{ x: number; y: number; dragged: boolean } | null>(null);
  const dragged = useRef(false);

  function handleMove(event: PointerEvent<HTMLDivElement>) {
    const start = pointer.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) {
      dragged.current = true;
      setYaw((value) => value - dx * 0.009);
      setPitch((value) => MathUtils.clamp(value + dy * 0.005, 0.27, 1.15));
    }
    pointer.current = { x: event.clientX, y: event.clientY, dragged: dragged.current };
  }

  function handleKey(event: React.KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case 'ArrowLeft': setYaw((value) => value - 0.15); break;
      case 'ArrowRight': setYaw((value) => value + 0.15); break;
      case 'ArrowUp': setPitch((value) => Math.min(1.15, value + 0.1)); break;
      case 'ArrowDown': setPitch((value) => Math.max(0.27, value - 0.1)); break;
      case '+': case '=': setRadius((value) => Math.max(13, value - 1)); break;
      case '-': setRadius((value) => Math.min(29, value + 1)); break;
      default: return;
    }
    event.preventDefault();
  }

  return <div className={styles.stage}>
    <div
      className={styles.viewport}
      tabIndex={0}
      aria-label="مشهد القرية: اسحب للتدوير، الأسهم لتغيير زاوية العرض، زائد وناقص للتقريب"
      onPointerDown={(event) => { pointer.current = { x: event.clientX, y: event.clientY, dragged: false }; dragged.current = false; }}
      onPointerMove={handleMove}
      onPointerUp={() => { pointer.current = null; }}
      onPointerCancel={() => { pointer.current = null; }}
      onPointerLeave={() => { pointer.current = null; }}
      onKeyDown={handleKey}
      onWheel={(event) => setRadius((value) => MathUtils.clamp(value + event.deltaY * 0.01, 13, 29))}
    >
      <Canvas
        aria-hidden="true"
        frameloop="demand"
        dpr={[1, 1.35]}
        gl={{ antialias: false, alpha: false, powerPreference: 'low-power' }}
        camera={{ position: [12, 14, 17], fov: 45, near: 0.1, far: 90 }}
        fallback={<span className={styles.unavailable}>العرض ثلاثي الأبعاد غير متاح؛ استخدم قائمة المباني.</span>}
      >
        <Camera yaw={yaw} pitch={pitch} radius={radius} />
        <KingdomSceneGeometry
          buildings={buildings}
          selected={selected}
          onSelect={(building) => { if (!dragged.current) onSelect(building); }}
        />
      </Canvas>
    </div>
    <div className={styles.cameraControls} aria-label="التحكم في زاوية المشهد">
      <button type="button" onClick={() => setYaw((value) => value - 0.28)} aria-label="دوّر المشهد إلى اليمين">↶</button>
      <button type="button" onClick={() => setYaw((value) => value + 0.28)} aria-label="دوّر المشهد إلى اليسار">↷</button>
      <button type="button" onClick={() => setRadius((value) => Math.max(13, value - 1.5))} aria-label="تقريب المشهد">＋</button>
      <button type="button" onClick={() => setRadius((value) => Math.min(29, value + 1.5))} aria-label="إبعاد المشهد">−</button>
    </div>
  </div>;
}

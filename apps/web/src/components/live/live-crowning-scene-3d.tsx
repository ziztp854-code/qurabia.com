'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

type PodiumRank = 1 | 2 | 3;

const podiums = [
  { rank: 2 as const, position: [-1.7, -0.45, 0] as const, height: 1.45 },
  { rank: 1 as const, position: [0, 0, 0] as const, height: 2.35 },
  { rank: 3 as const, position: [1.7, -0.7, 0] as const, height: 0.95 },
];

// WebGL materials cannot resolve CSS custom properties; these mirror the
// --tahaddi-* compatibility aliases in apps/web/tokens.css.
const tahaddiCanvasPalette = {
  background: '#020609',
  gold: '#d4af37',
  goldBright: '#f2c14e',
  live: '#00d9f5',
  silver: '#cbd5e1',
  bronze: '#c47a3d',
};

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return reducedMotion;
}

function Crown({ color, gemColor, motionEnabled }: { color: string; gemColor: string; motionEnabled: boolean }) {
  const crown = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!motionEnabled || !crown.current) return;
    crown.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.7) * 0.24;
    crown.current.position.y = 2.65 + Math.sin(state.clock.elapsedTime * 1.4) * 0.08;
  });

  return (
    <group ref={crown} position={[0, 2.65, 0]}>
      <mesh position={[0, -0.1, 0]}>
        <cylinderGeometry args={[0.68, 0.74, 0.3, 6]} />
        <meshStandardMaterial color={color} metalness={0.92} roughness={0.18} />
      </mesh>
      {[-0.45, 0, 0.45].map((x, index) => (
        <mesh key={x} position={[x, 0.38 - Math.abs(x) * 0.18, 0]}>
          <coneGeometry args={[0.2, index === 1 ? 0.95 : 0.72, 5]} />
          <meshStandardMaterial color={color} metalness={0.92} roughness={0.16} />
        </mesh>
      ))}
      <mesh position={[0, -0.3, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.66, 0.08, 10, 40]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.22} />
      </mesh>
      <mesh position={[0, 0.02, 0.28]}>
        <sphereGeometry args={[0.12, 20, 20]} />
        <meshStandardMaterial color={gemColor} emissive={gemColor} emissiveIntensity={0.7} />
      </mesh>
    </group>
  );
}

function CelebrationPoints({ color, motionEnabled }: { color: string; motionEnabled: boolean }) {
  const points = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const values = new Float32Array(90);
    for (let index = 0; index < 30; index += 1) {
      const angle = index * 2.399;
      const radius = 2.3 + (index % 5) * 0.55;
      values[index * 3] = Math.cos(angle) * radius;
      values[index * 3 + 1] = 0.2 + (index % 7) * 0.65;
      values[index * 3 + 2] = Math.sin(angle) * 0.55;
    }
    return values;
  }, []);

  useFrame((_, delta) => {
    if (motionEnabled && points.current) points.current.rotation.y += delta * 0.08;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color={color} size={0.07} sizeAttenuation transparent opacity={0.72} />
    </points>
  );
}

function CrowningScene({
  activeRank,
  motionEnabled,
}: {
  activeRank?: PodiumRank;
  motionEnabled: boolean;
}) {
  const palette = tahaddiCanvasPalette;
  const rankColors = { 1: palette.goldBright, 2: palette.silver, 3: palette.bronze } as const;

  return (
    <>
      <ambientLight intensity={0.85} />
      <directionalLight color={palette.goldBright} intensity={2.4} position={[1.5, 5, 4]} />
      <pointLight color={palette.gold} intensity={18} position={[0, 2.4, 2.2]} distance={8} />
      <CelebrationPoints color={palette.goldBright} motionEnabled={motionEnabled} />
      <Crown color={palette.goldBright} gemColor={palette.live} motionEnabled={motionEnabled} />
      {podiums.map(({ rank, position, height }) => {
        const active = activeRank === undefined || activeRank === rank;
        const color = rankColors[rank];
        return (
          <group key={rank} position={position}>
            <mesh position={[0, height / 2, 0]}>
              <cylinderGeometry args={[0.76, 0.86, height, 8]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={active ? 0.24 : 0.06}
                metalness={0.72}
                roughness={0.3}
              />
            </mesh>
            <mesh position={[0, height + 0.035, 0]}>
              <cylinderGeometry args={[0.78, 0.78, 0.08, 32]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={active ? 0.38 : 0.12}
                metalness={0.9}
                roughness={0.14}
              />
            </mesh>
            <mesh position={[0, height * 0.58, 0.77]}>
              <torusGeometry args={[0.24, 0.045, 10, 36]} />
              <meshBasicMaterial color={color} transparent opacity={active ? 0.95 : 0.45} />
            </mesh>
          </group>
        );
      })}
      <mesh position={[0, -0.65, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[3.2, 0.035, 8, 72]} />
        <meshBasicMaterial color={palette.gold} transparent opacity={0.55} />
      </mesh>
      <mesh position={[0, -0.64, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2.55, 0.012, 8, 72]} />
        <meshBasicMaterial color={palette.goldBright} transparent opacity={0.24} />
      </mesh>
    </>
  );
}

export function LiveCrowningScene3D({ activeRank }: { activeRank?: PodiumRank }) {
  const reducedMotion = useReducedMotion();

  return (
    <div
      aria-hidden="true"
      data-live-crowning-scene="3d"
      style={{
        width: 'min(100%, 34rem)',
        height: 'clamp(14rem, 32vw, 20rem)',
        marginBlock: '1rem',
        pointerEvents: 'none',
      }}
    >
      <Canvas
        frameloop={reducedMotion ? 'demand' : 'always'}
        camera={{
          position: [0, 2.8, 8.4],
          rotation: [-0.18, 0, 0],
          fov: 40,
          near: 0.1,
          far: 40,
        }}
        dpr={[1, 1.35]}
        gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
        performance={{ min: 0.6, debounce: 240 }}
        fallback={<div data-live-crowning-fallback="webgl" />}
      >
        <CrowningScene activeRank={activeRank} motionEnabled={!reducedMotion} />
      </Canvas>
    </div>
  );
}

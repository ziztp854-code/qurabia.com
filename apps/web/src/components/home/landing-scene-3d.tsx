'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject, ReactNode } from 'react';
import * as THREE from 'three';

type SceneQuality = 'high' | 'medium' | 'low';

type PointerTarget = {
  x: number;
  y: number;
};

type GameObjectId = 'brand' | 'baloot' | 'chess' | 'trophy' | 'questions' | 'dice';

type GameObjectProps = {
  active: boolean;
  onActivate: (href: string) => void;
  onHover: (id: GameObjectId | null) => void;
  reducedMotion: boolean;
};

const GAME_LINKS = {
  brand: '/games',
  baloot: '/games/baloot',
  chess: '/games/chess',
  trophy: '/leaderboard',
  questions: '/questions',
  dice: '/games',
} as const satisfies Record<GameObjectId, string>;

const GOLD = '#f5b83d';
const GOLD_DEEP = '#8a5614';
const INK = '#03070d';
const NAVY = '#08121f';
const IVORY = '#f8f4ee';
const CYAN = '#00d9ff';

function useSceneSettings() {
  const [settings, setSettings] = useState({
    reducedMotion: false,
    quality: 'high' as SceneQuality,
    dpr: [1, 1.6] as [number, number],
  });

  useEffect(() => {
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const sync = () => {
      const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
      const isCompact = window.matchMedia('(max-width: 64rem)').matches;
      const lowPower =
        isCompact ||
        deviceMemory <= 4 ||
        navigator.hardwareConcurrency <= 4 ||
        motionQuery.matches;

      setSettings({
        reducedMotion: motionQuery.matches,
        quality: lowPower ? 'low' : deviceMemory <= 6 ? 'medium' : 'high',
        dpr: lowPower ? [1, 1.1] : [1, Math.min(window.devicePixelRatio, 1.6)],
      });
    };

    sync();
    motionQuery.addEventListener('change', sync);
    window.addEventListener('resize', sync);

    return () => {
      motionQuery.removeEventListener('change', sync);
      window.removeEventListener('resize', sync);
    };
  }, []);

  return settings;
}

function makeTexture(
  width: number,
  height: number,
  paint: (context: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => void,
) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  paint(context, canvas);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 6;
  return texture;
}

function useLabelTexture(label: string, accent = GOLD) {
  const texture = useMemo(
    () =>
      makeTexture(768, 320, (context, canvas) => {
        context.fillStyle = NAVY;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.strokeStyle = 'rgba(212, 175, 55, 0.46)';
        context.lineWidth = 10;
        context.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);
        context.direction = 'rtl';
        context.fillStyle = accent;
        context.font = '900 132px "Alexandria Variable", "Cairo Variable", Cairo, Arial, sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(label, canvas.width / 2, canvas.height / 2 + 4);
      }),
    [accent, label],
  );

  useEffect(() => () => texture?.dispose(), [texture]);

  return texture;
}

function useTahaddiTexture() {
  const texture = useMemo(
    () =>
      makeTexture(1400, 620, (context, canvas) => {
        context.clearRect(0, 0, canvas.width, canvas.height);
        const gradient = context.createLinearGradient(0, 70, 0, 470);
        gradient.addColorStop(0, '#fff1b8');
        gradient.addColorStop(0.46, GOLD);
        gradient.addColorStop(1, '#a56617');

        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.lineJoin = 'round';
        context.direction = 'rtl';
        context.font = '900 330px "Alexandria Variable", "Cairo Variable", Cairo, Arial, sans-serif';
        context.strokeStyle = 'rgba(3, 7, 13, 0.82)';
        context.lineWidth = 18;
        context.strokeText('تحدي', 700, 320);
        context.fillStyle = gradient;
        context.fillText('تحدي', 700, 320);

        context.fillStyle = 'rgba(248, 244, 238, 0.92)';
        context.font = '800 52px "Cairo Variable", Cairo, Arial, sans-serif';
        context.fillText('العب . نافس . تصدر', 700, 535);
      }),
    [],
  );

  useEffect(() => () => texture?.dispose(), [texture]);

  return texture;
}

function useCrownTexture() {
  const texture = useMemo(
    () =>
      makeTexture(620, 520, (context, canvas) => {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.translate(0, 4);
        context.lineCap = 'round';
        context.lineJoin = 'miter';
        context.shadowColor = 'rgba(212, 175, 55, 0.26)';
        context.shadowBlur = 30;

        const gradient = context.createLinearGradient(40, 40, canvas.width - 40, canvas.height - 40);
        gradient.addColorStop(0, '#fff1b8');
        gradient.addColorStop(0.52, GOLD);
        gradient.addColorStop(1, GOLD_DEEP);
        context.strokeStyle = gradient;

        context.lineWidth = 32;
        context.beginPath();
        context.moveTo(70, 205);
        context.lineTo(202, 284);
        context.lineTo(310, 54);
        context.lineTo(418, 284);
        context.lineTo(550, 205);
        context.lineTo(462, 446);
        context.lineTo(158, 446);
        context.closePath();
        context.stroke();

        context.lineWidth = 24;
        context.beginPath();
        context.moveTo(202, 284);
        context.lineTo(158, 446);
        context.moveTo(418, 284);
        context.lineTo(462, 446);
        context.moveTo(310, 54);
        context.lineTo(310, 446);
        context.moveTo(70, 205);
        context.lineTo(310, 446);
        context.lineTo(550, 205);
        context.stroke();
      }),
    [],
  );

  useEffect(() => () => texture?.dispose(), [texture]);

  return texture;
}

function seededUnit(index: number, salt: number) {
  let value = Math.imul(index + 1, 374761393) ^ Math.imul(salt + 17, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function ParticleField({ reducedMotion }: { reducedMotion: boolean }) {
  const pointsRef = useRef<THREE.Points>(null);
  const count = 20;

  const positions = useMemo(() => {
    const next = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      next[index * 3] = (seededUnit(index, 1) - 0.5) * 8;
      next[index * 3 + 1] = seededUnit(index, 2) * 3.5 - 0.6;
      next[index * 3 + 2] = (seededUnit(index, 3) - 0.5) * 4.8;
    }
    return next;
  }, []);

  useFrame(({ clock }) => {
    if (reducedMotion || !pointsRef.current) return;
    pointsRef.current.rotation.y = Math.sin(clock.elapsedTime * 0.08) * 0.08;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color={GOLD} opacity={0.22} size={0.03} sizeAttenuation transparent />
    </points>
  );
}

function InteractiveGroup({
  children,
  href,
  id,
  onActivate,
  onHover,
  reducedMotion,
}: GameObjectProps & {
  children: ReactNode;
  href: string;
  id: GameObjectId;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const phase = useMemo(() => {
    const index = (Object.keys(GAME_LINKS) as GameObjectId[]).indexOf(id);
    return index * 0.72;
  }, [id]);

  useFrame(({ clock }) => {
    if (reducedMotion || !groupRef.current) return;
    const time = clock.elapsedTime + phase;
    const lift = id === 'brand' ? 0.018 : 0.055;
    groupRef.current.position.y = Math.sin(time * 0.82) * lift;
    groupRef.current.rotation.y = Math.sin(time * 0.46) * (id === 'brand' ? 0.018 : 0.045);
    groupRef.current.rotation.z = Math.cos(time * 0.38) * (id === 'brand' ? 0.006 : 0.018);
  });

  return (
    <group
      ref={groupRef}
      onClick={(event) => {
        event.stopPropagation();
        onActivate(href);
      }}
      onPointerOut={(event) => {
        event.stopPropagation();
        onHover(null);
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        onHover(id);
      }}
    >
      {children}
    </group>
  );
}

function BalootCards(props: GameObjectProps) {
  const texture = useLabelTexture('A K Q', GOLD);

  return (
    <InteractiveGroup {...props} href={GAME_LINKS.baloot} id="baloot">
      <group position={[-2.66, 1.38, -0.08]} rotation={[0.05, 0.38, -0.22]} scale={0.72}>
        {[-0.34, -0.1, 0.14].map((offset, index) => (
          <mesh
            castShadow
            key={offset}
            position={[offset, index * 0.04, index * 0.03]}
            rotation={[0.05, 0, -0.16 + index * 0.12]}
          >
            <boxGeometry args={[0.82, 1.18, 0.035]} />
            <meshPhysicalMaterial
              clearcoat={0.18}
              color={index === 2 ? NAVY : IVORY}
              emissive={props.active ? GOLD_DEEP : '#000000'}
              emissiveIntensity={props.active ? 0.24 : 0.02}
              map={index === 2 ? texture ?? undefined : undefined}
              metalness={0.05}
              roughness={0.3}
            />
          </mesh>
        ))}
      </group>
    </InteractiveGroup>
  );
}

function ChessPiece(props: GameObjectProps) {
  return (
    <InteractiveGroup {...props} href={GAME_LINKS.chess} id="chess">
      <group position={[2.78, 0.88, 0.1]} rotation={[0, -0.36, 0]} scale={0.72}>
        <mesh castShadow position={[0, -0.5, 0]}>
          <cylinderGeometry args={[0.48, 0.64, 0.18, 48]} />
          <meshPhysicalMaterial
            clearcoat={0.25}
            color={NAVY}
            emissive={props.active ? GOLD_DEEP : INK}
            emissiveIntensity={props.active ? 0.3 : 0.08}
            metalness={0.35}
            roughness={0.38}
          />
        </mesh>
        <mesh castShadow position={[0, -0.22, 0]}>
          <cylinderGeometry args={[0.27, 0.4, 0.48, 48]} />
          <meshPhysicalMaterial color={NAVY} metalness={0.35} roughness={0.38} />
        </mesh>
        <mesh castShadow position={[0, 0.16, 0]}>
          <sphereGeometry args={[0.34, 42, 24]} />
          <meshPhysicalMaterial
            clearcoat={0.18}
            color={IVORY}
            metalness={0.05}
            roughness={0.3}
          />
        </mesh>
        <mesh castShadow position={[0, 0.54, 0]} rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.14, 0.42, 0.14]} />
          <meshPhysicalMaterial color={GOLD} metalness={0.92} roughness={0.26} />
        </mesh>
      </group>
    </InteractiveGroup>
  );
}

function Trophy(props: GameObjectProps) {
  return (
    <InteractiveGroup {...props} href={GAME_LINKS.trophy} id="trophy">
      <group position={[3.55, 1.08, 0.86]} rotation={[0, -0.18, 0]} scale={0.48}>
        <mesh castShadow position={[0, -0.52, 0]}>
          <cylinderGeometry args={[0.36, 0.54, 0.18, 48]} />
          <meshPhysicalMaterial color={GOLD_DEEP} metalness={0.92} roughness={0.26} />
        </mesh>
        <mesh castShadow position={[0, -0.2, 0]}>
          <cylinderGeometry args={[0.15, 0.22, 0.5, 40]} />
          <meshPhysicalMaterial color={GOLD} metalness={0.92} roughness={0.26} />
        </mesh>
        <mesh castShadow position={[0, 0.16, 0]}>
          <cylinderGeometry args={[0.48, 0.3, 0.56, 64, 1, true]} />
          <meshPhysicalMaterial
            clearcoat={0.45}
            color={GOLD}
            emissive={props.active ? GOLD_DEEP : '#000000'}
            emissiveIntensity={props.active ? 0.2 : 0.04}
            metalness={0.92}
            roughness={0.26}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
    </InteractiveGroup>
  );
}

function QuestionCard(props: GameObjectProps) {
  const texture = useLabelTexture('؟', CYAN);

  return (
    <InteractiveGroup {...props} href={GAME_LINKS.questions} id="questions">
      <mesh castShadow position={[2.35, 2.02, -0.28]} rotation={[0.22, -0.42, 0.18]} scale={0.62}>
        <boxGeometry args={[0.95, 1.08, 0.04]} />
        <meshPhysicalMaterial
          clearcoat={0.25}
          color={NAVY}
          emissive={props.active ? CYAN : INK}
          emissiveIntensity={props.active ? 0.28 : 0.08}
          map={texture ?? undefined}
          metalness={0.35}
          roughness={0.38}
        />
      </mesh>
    </InteractiveGroup>
  );
}

function Dice(props: GameObjectProps) {
  const pipPositions = [
    [-0.16, 0.251, -0.16],
    [0.16, 0.251, 0.16],
    [-0.17, -0.17, 0.251],
    [0.17, 0.17, 0.251],
    [0, 0, 0.251],
  ] as const;

  return (
    <InteractiveGroup {...props} href={GAME_LINKS.dice} id="dice">
      <group position={[-3.15, 0.38, 0.92]} rotation={[0.56, 0.66, -0.1]} scale={0.54}>
        <mesh castShadow>
          <boxGeometry args={[0.74, 0.74, 0.74]} />
          <meshPhysicalMaterial
            clearcoat={0.18}
            color={IVORY}
            emissive={props.active ? GOLD_DEEP : '#000000'}
            emissiveIntensity={props.active ? 0.16 : 0.02}
            metalness={0.05}
            roughness={0.3}
          />
        </mesh>
        {pipPositions.map(([x, y, z]) => (
          <mesh key={`${x}-${y}-${z}`} position={[x, y, z]}>
            <sphereGeometry args={[0.048, 16, 10]} />
            <meshStandardMaterial color={GOLD} emissive={GOLD_DEEP} emissiveIntensity={0.12} />
          </mesh>
        ))}
      </group>
    </InteractiveGroup>
  );
}

function CentralBrand(props: GameObjectProps) {
  const tahaddiTexture = useTahaddiTexture();
  const crownTexture = useCrownTexture();
  const amiraTexture = useLabelTexture('أميرة', GOLD);

  return (
    <>
      <InteractiveGroup {...props} href={GAME_LINKS.brand} id="brand">
        <group position={[0, 1.18, 0.18]}>
          <mesh castShadow position={[0, 0, -0.08]}>
            <boxGeometry args={[4.92, 2, 0.16]} />
            <meshPhysicalMaterial
              clearcoat={0.25}
              color={NAVY}
              emissive={props.active ? GOLD_DEEP : '#000000'}
              emissiveIntensity={props.active ? 0.18 : 0.06}
              metalness={0.6}
              opacity={0.34}
              roughness={0.3}
              transparent
            />
          </mesh>
          <mesh position={[0, 0, 0.02]}>
            <planeGeometry args={[4.7, 1.82]} />
            <meshBasicMaterial map={tahaddiTexture ?? undefined} toneMapped={false} transparent />
          </mesh>
        </group>
      </InteractiveGroup>

      <group position={[0, 2.88, 0.08]} scale={0.88}>
        <mesh position={[0, 0, 0.02]}>
          <planeGeometry args={[1.2, 1]} />
          <meshBasicMaterial map={crownTexture ?? undefined} toneMapped={false} transparent />
        </mesh>
      </group>

      <group position={[0, 0.5, 1.54]} rotation={[-0.34, 0, 0]}>
        <mesh castShadow position={[0, 0, -0.035]}>
          <boxGeometry args={[1.66, 0.48, 0.055]} />
          <meshPhysicalMaterial
            clearcoat={0.25}
            color={NAVY}
            emissive={GOLD_DEEP}
            emissiveIntensity={0.18}
            metalness={0.35}
            roughness={0.34}
          />
        </mesh>
        <mesh position={[0, 0, 0.005]}>
          <planeGeometry args={[1.5, 0.4]} />
          <meshBasicMaterial map={amiraTexture ?? undefined} toneMapped={false} transparent />
        </mesh>
      </group>
    </>
  );
}

function Platform() {
  return (
    <group position={[0, -0.08, 0]}>
      <mesh castShadow receiveShadow position={[0, -0.32, 0]}>
        <cylinderGeometry args={[4.4, 4.4, 0.32, 112]} />
        <meshPhysicalMaterial
          clearcoat={0.25}
          color={INK}
          metalness={0.6}
          roughness={0.3}
        />
      </mesh>
      <mesh castShadow receiveShadow position={[0, -0.04, 0]}>
        <cylinderGeometry args={[3.9, 3.9, 0.22, 112]} />
        <meshPhysicalMaterial color={NAVY} metalness={0.35} roughness={0.38} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.18, 0]}>
        <cylinderGeometry args={[3.45, 3.45, 0.18, 112]} />
        <meshPhysicalMaterial
          clearcoat={0.25}
          color={INK}
          metalness={0.6}
          roughness={0.3}
        />
      </mesh>
      {[3.52, 4.18].map((radius, index) => (
        <mesh key={radius} position={[0, 0.31 + index * 0.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[radius, 0.018, 10, 160]} />
          <meshPhysicalMaterial color={GOLD} metalness={0.92} roughness={0.26} />
        </mesh>
      ))}
    </group>
  );
}

function GameWorld({
  hoveredId,
  onActivate,
  onHover,
  pointer,
  quality,
  reducedMotion,
}: {
  hoveredId: GameObjectId | null;
  onActivate: (href: string) => void;
  onHover: (id: GameObjectId | null) => void;
  pointer: MutableRefObject<PointerTarget>;
  quality: SceneQuality;
  reducedMotion: boolean;
}) {
  const worldRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!worldRef.current) return;
    worldRef.current.rotation.y = THREE.MathUtils.lerp(
      worldRef.current.rotation.y,
      pointer.current.x * 0.08,
      0.06,
    );
    worldRef.current.rotation.x = THREE.MathUtils.lerp(
      worldRef.current.rotation.x,
      -0.1 - pointer.current.y * 0.045,
      0.06,
    );
    if (!reducedMotion) {
      worldRef.current.position.y = -0.5 + Math.sin(clock.getElapsedTime() * 0.42) * 0.035;
    }
  });

  const showSecondary = quality !== 'low';

  return (
    <group ref={worldRef} position={[1.3, -0.3, 0]} scale={1.34}>
      <Platform />
      <CentralBrand
        active={hoveredId === 'brand'}
        onActivate={onActivate}
        onHover={onHover}
        reducedMotion={reducedMotion}
      />
      <BalootCards
        active={hoveredId === 'baloot'}
        onActivate={onActivate}
        onHover={onHover}
        reducedMotion={reducedMotion}
      />
      <ChessPiece
        active={hoveredId === 'chess'}
        onActivate={onActivate}
        onHover={onHover}
        reducedMotion={reducedMotion}
      />
      {showSecondary && (
        <>
          <Trophy
            active={hoveredId === 'trophy'}
            onActivate={onActivate}
            onHover={onHover}
            reducedMotion={reducedMotion}
          />
          <QuestionCard
            active={hoveredId === 'questions'}
            onActivate={onActivate}
            onHover={onHover}
            reducedMotion={reducedMotion}
          />
          <Dice
            active={hoveredId === 'dice'}
            onActivate={onActivate}
            onHover={onHover}
            reducedMotion={reducedMotion}
          />
        </>
      )}
    </group>
  );
}

function LandingStage({
  hoveredId,
  onActivate,
  onHover,
  pointer,
  quality,
  reducedMotion,
}: {
  hoveredId: GameObjectId | null;
  onActivate: (href: string) => void;
  onHover: (id: GameObjectId | null) => void;
  pointer: MutableRefObject<PointerTarget>;
  quality: SceneQuality;
  reducedMotion: boolean;
}) {
  return (
    <>
      <color attach="background" args={[INK]} />
      <fog attach="fog" args={[INK, 12, 26]} />
      <ambientLight color={IVORY} intensity={0.18} />
      <spotLight
        castShadow={quality !== 'low'}
        color={IVORY}
        intensity={4.4}
        angle={Math.PI / 6}
        penumbra={0.45}
        position={[4, 9, 7]}
        distance={30}
      />
      <pointLight color={GOLD} intensity={2.7} distance={12} position={[-4, 2.5, -3]} />
      <pointLight color={CYAN} intensity={0.72} distance={10} position={[4.5, 2.8, -3]} />
      <directionalLight color={IVORY} intensity={0.35} position={[-3, 2, 4]} />

      <ParticleField reducedMotion={reducedMotion} />
      <GameWorld
        hoveredId={hoveredId}
        onActivate={onActivate}
        onHover={onHover}
        pointer={pointer}
        quality={quality}
        reducedMotion={reducedMotion}
      />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.98, 0]} receiveShadow>
        <planeGeometry args={[13, 9]} />
        <meshPhysicalMaterial color={INK} metalness={0.18} roughness={0.86} />
      </mesh>
    </>
  );
}

export function LandingScene3D() {
  const pointerRef = useRef<PointerTarget>({ x: 0, y: 0 });
  const sceneRef = useRef<HTMLDivElement>(null);
  const [hoveredId, setHoveredId] = useState<GameObjectId | null>(null);
  const router = useRouter();
  const { dpr, quality, reducedMotion } = useSceneSettings();

  const activate = useCallback(
    (href: string) => {
      router.push(href);
    },
    [router],
  );

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const bounds = sceneRef.current?.getBoundingClientRect();
      if (!bounds) return;
      pointerRef.current = {
        x: ((event.clientX - bounds.left) / bounds.width - 0.5) * 2,
        y: ((event.clientY - bounds.top) / bounds.height - 0.5) * 2,
      };
    };

    const handleBlur = () => {
      pointerRef.current = { x: 0, y: 0 };
      setHoveredId(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  return (
    <div
      className="landing-scene-3d"
      data-hovered-game={hoveredId ?? undefined}
      data-landing-scene-3d
      data-quality={quality}
      ref={sceneRef}
      aria-hidden="true"
    >
      <Canvas
        camera={{ position: [0, 3.8, 11.2], fov: 34, near: 0.1, far: 40 }}
        dpr={dpr}
        frameloop={reducedMotion ? 'demand' : 'always'}
        gl={{ alpha: false, antialias: quality !== 'low', powerPreference: 'high-performance' }}
        onCreated={({ camera, gl }) => {
          camera.lookAt(0.6, 1.35, 0);
          camera.updateProjectionMatrix();
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 0.95;
        }}
        shadows={quality !== 'low'}
        fallback={<div className="landing-scene-3d__fallback" />}
      >
        <LandingStage
          hoveredId={hoveredId}
          onActivate={activate}
          onHover={setHoveredId}
          pointer={pointerRef}
          quality={quality}
          reducedMotion={reducedMotion}
        />
      </Canvas>
    </div>
  );
}

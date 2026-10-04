import type { ThreeEvent } from '@react-three/fiber';
import type { Building } from '@/lib/kingdoms/types';
import type { SceneBuilding } from './kingdom-scene-state';

// WebGL cannot resolve CSS tokens. This palette mirrors the Kingdoms sand, navy and gilt art direction.
const color = {
  sand: '#cba976', sandstone: '#d6b486', plaster: '#ead1aa', light: '#f3dfba',
  shade: '#a97850', dark: '#5e493d', roof: '#745744', teal: '#07636a',
  blue: '#074153', gold: '#d7ab4b', water: '#318b97', green: '#456844',
  foliage: '#31563b', wood: '#765139', construction: '#c88a45',
};

export const scenePlots: Record<Building, [number, number]> = {
  hall: [0, -1.2], lumber: [-5.1, -2.9], quarry: [4.9, -3.1],
  mine: [5.1, -4.9], farm: [-5.2, 3.3], treasury: [2.6, -1.3],
  warehouse: [5, 1.3], barracks: [-3.1, -0.6], stable: [-4.4, 0.8], wall: [0, 0],
  market: [2.6, 2.5], embassy: [-1.9, 2.6],
};

function Box({ at, size, paint, opacity = 1 }: {
  at: [number, number, number]; size: [number, number, number]; paint: string; opacity?: number;
}) {
  return <mesh position={at}>
    <boxGeometry args={size} />
    <meshStandardMaterial color={paint} roughness={0.92} transparent={opacity < 1} opacity={opacity} />
  </mesh>;
}

function Cylinder({ at, radius, height, paint, sides = 8 }: {
  at: [number, number, number]; radius: number; height: number; paint: string; sides?: number;
}) {
  return <mesh position={at}>
    <cylinderGeometry args={[radius, radius * 1.08, height, sides]} />
    <meshStandardMaterial color={paint} roughness={0.84} />
  </mesh>;
}

function Dome({ at, radius = 0.45, paint = color.teal }: {
  at: [number, number, number]; radius?: number; paint?: string;
}) {
  return <mesh position={at}>
    <sphereGeometry args={[radius, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
    <meshStandardMaterial color={paint} metalness={0.12} roughness={0.72} />
  </mesh>;
}

function Tower({ x, z, height = 1.6, radius = 0.32 }: { x: number; z: number; height?: number; radius?: number }) {
  return <group position={[x, 0, z]}>
    <Cylinder at={[0, height / 2, 0]} radius={radius} height={height} paint={color.sandstone} sides={8} />
    <Cylinder at={[0, height + 0.1, 0]} radius={radius * 1.18} height={0.2} paint={color.light} sides={8} />
    <Box at={[0, height * 0.7, radius + 0.01]} size={[0.08, 0.22, 0.02]} paint={color.dark} />
  </group>;
}

function Banner({ x, y, z }: { x: number; y: number; z: number }) {
  return <group position={[x, y, z]}>
    <Cylinder at={[0, 0.36, 0]} radius={0.018} height={0.72} paint={color.gold} sides={6} />
    <Box at={[0.18, 0.54, 0]} size={[0.35, 0.25, 0.025]} paint={color.teal} />
    <Box at={[0.13, 0.54, 0.018]} size={[0.05, 0.05, 0.02]} paint={color.gold} />
  </group>;
}

function Palm({ x, z, height = 0.9 }: { x: number; z: number; height?: number }) {
  return <group position={[x, 0, z]}>
    <Cylinder at={[0, height / 2, 0]} radius={0.06} height={height} paint={color.wood} sides={6} />
    {[0, 1, 2, 3, 4].map((index) => <mesh key={index} position={[0, height, 0]} rotation={[0.35, index * Math.PI * 0.4, 0.5]}>
      <coneGeometry args={[0.23, 0.85, 4]} />
      <meshStandardMaterial color={color.foliage} roughness={1} side={2} />
    </mesh>)}
  </group>;
}

function Plaza() {
  return <>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]}>
      <planeGeometry args={[18, 14]} />
      <meshStandardMaterial color={color.sand} roughness={1} />
    </mesh>
    <Box at={[0, -0.02, 0.8]} size={[1.15, 0.025, 10.2]} paint={color.plaster} />
    <Box at={[0.2, -0.014, 0.4]} size={[12.6, 0.026, 0.9]} paint={color.plaster} />
    <Box at={[0, -0.035, 5.7]} size={[18, 0.025, 1.25]} paint={color.water} />
    <Box at={[0, 0.02, 5.05]} size={[18, 0.1, 0.12]} paint={color.light} />
    <Box at={[0, 0.02, 6.35]} size={[18, 0.1, 0.12]} paint={color.light} />
    <Box at={[0, 0.05, 5.7]} size={[1.1, 0.1, 1.5]} paint={color.sandstone} />
    <Cylinder at={[0, 0.12, 1.1]} radius={0.36} height={0.15} paint={color.light} sides={12} />
    <Cylinder at={[0, 0.2, 1.1]} radius={0.22} height={0.07} paint={color.water} sides={12} />
    {[
      [-7.5, -4.3], [-7, 0], [-7, 3.8], [-4.1, 4.6], [5.7, 3.9],
      [7, 0.7], [7.4, -4], [3.6, 4.8], [-1, 4.8],
    ].map(([x, z]) => <Palm key={`${x}:${z}`} x={x} z={z} height={0.75 + (Math.abs(x) % 2) * 0.15} />)}
    <mesh position={[0, -0.45, 0]}>
      <boxGeometry args={[18, 0.8, 14]} />
      <meshStandardMaterial color={color.shade} roughness={1} />
    </mesh>
  </>;
}

function Hall({ height }: { height: number }) {
  return <>
    <Box at={[0, height * 0.45, 0]} size={[2.5, height * 0.9, 1.9]} paint={color.sandstone} />
    <Box at={[0, height * 0.9, 0]} size={[2.7, 0.17, 2.1]} paint={color.light} />
    <Box at={[0, height * 0.5, 0.96]} size={[0.42, height * 0.7, 0.04]} paint={color.dark} />
    <Box at={[0, height * 0.88, 0.99]} size={[0.66, 0.12, 0.06]} paint={color.teal} />
    <Cylinder at={[0, height + 0.21, 0]} radius={0.46} height={0.32} paint={color.plaster} />
    <Dome at={[0, height + 0.37, 0]} radius={0.44} />
    {[[-1.18, -0.87], [1.18, -0.87], [-1.18, 0.87], [1.18, 0.87]].map(([x, z]) => <Tower key={`${x}:${z}`} x={x} z={z} height={height * 0.95} radius={0.23} />)}
    <Banner x={0.75} y={height} z={0} />
  </>;
}

function Lumber({ height }: { height: number }) {
  return <>
    <Box at={[0, height / 2, 0]} size={[1.5, height, 1.05]} paint={color.sandstone} />
    <Box at={[0, height + 0.12, 0]} size={[1.7, 0.17, 1.25]} paint={color.roof} />
    {[-0.4, 0, 0.4].map((x) => <Cylinder key={x} at={[x, 0.16, 0.75]} radius={0.13} height={0.86} paint={color.wood} sides={6} />)}
  </>;
}

function Quarry({ height }: { height: number }) {
  return <>
    <Box at={[0, height * 0.3, 0]} size={[1.35, height * 0.6, 1.2]} paint={color.shade} />
    {[-0.48, 0.05, 0.5].map((x, i) => <Box key={x} at={[x, 0.23 + i * 0.1, 0.8]} size={[0.47, 0.46 + i * 0.2, 0.44]} paint={i === 1 ? color.light : color.sandstone} />)}
    <Box at={[0, height * 0.78, -0.52]} size={[1.5, 0.12, 0.13]} paint={color.wood} />
  </>;
}

function Mine({ height }: { height: number }) {
  return <>
    <mesh position={[0, height * 0.55, -0.15]}>
      <coneGeometry args={[1.15, height * 1.1, 5]} />
      <meshStandardMaterial color={color.shade} roughness={1} />
    </mesh>
    <Box at={[0, 0.4, 0.8]} size={[0.65, 0.8, 0.12]} paint={color.dark} />
    <Box at={[0, 0.85, 0.82]} size={[0.85, 0.12, 0.15]} paint={color.wood} />
  </>;
}

function Farm({ height }: { height: number }) {
  return <>
    <Box at={[-0.42, height * 0.42, -0.2]} size={[0.95, height * 0.84, 0.8]} paint={color.sandstone} />
    <Dome at={[-0.42, height * 0.84, -0.2]} radius={0.45} paint={color.plaster} />
    {[-0.6, -0.24, 0.12, 0.48].map((z) => <Box key={z} at={[0.5, 0.05, z]} size={[0.95, 0.1, 0.2]} paint={color.green} />)}
  </>;
}

function Treasury({ height }: { height: number }) {
  return <>
    <Cylinder at={[0, height * 0.42, 0]} radius={0.74} height={height * 0.84} paint={color.plaster} sides={8} />
    <Dome at={[0, height * 0.84, 0]} radius={0.74} paint={color.gold} />
    <Box at={[0, height * 0.37, 0.74]} size={[0.35, height * 0.58, 0.06]} paint={color.dark} />
    <Cylinder at={[0, height + 0.3, 0]} radius={0.04} height={0.3} paint={color.gold} />
  </>;
}

function Warehouse({ height }: { height: number }) {
  return <>
    <Box at={[0, height * 0.47, 0]} size={[1.9, height * 0.94, 1.15]} paint={color.sandstone} />
    <Box at={[0, height, 0]} size={[2.1, 0.2, 1.35]} paint={color.roof} />
    {[-0.5, 0.5].map((x) => <Box key={x} at={[x, height * 0.36, 0.58]} size={[0.35, height * 0.7, 0.05]} paint={color.wood} />)}
  </>;
}

function Barracks({ height }: { height: number }) {
  return <>
    <Box at={[0, height * 0.45, -0.2]} size={[2.1, height * 0.9, 1.15]} paint={color.sandstone} />
    <Box at={[0, height * 0.95, -0.2]} size={[2.3, 0.16, 1.35]} paint={color.roof} />
    <Tower x={-0.95} z={0.6} height={height * 0.85} radius={0.25} />
    <Tower x={0.95} z={0.6} height={height * 0.85} radius={0.25} />
    <Banner x={0} y={height * 0.9} z={-0.2} />
  </>;
}

function Market({ height }: { height: number }) {
  return <>
    <Box at={[0, height * 0.28, -0.3]} size={[1.5, height * 0.56, 0.8]} paint={color.sandstone} />
    {[-0.62, 0.62].map((x) => <group key={x} position={[x, 0, 0.52]}>
      <Box at={[0, height * 0.43, 0]} size={[0.74, 0.1, 0.82]} paint={color.teal} />
      <Box at={[0, height * 0.2, 0]} size={[0.72, 0.14, 0.46]} paint={color.wood} />
    </group>)}
  </>;
}

function Embassy({ height }: { height: number }) {
  return <>
    <Box at={[0, height * 0.45, 0]} size={[1.65, height * 0.9, 1.35]} paint={color.plaster} />
    <Dome at={[0, height * 0.9, 0]} radius={0.65} />
    <Box at={[0, height * 0.36, 0.7]} size={[0.46, height * 0.62, 0.05]} paint={color.dark} />
    <Banner x={0.7} y={height * 0.9} z={0} />
  </>;
}

function StableYard({ height }: { height: number }) {
  return <>
    <Box at={[0, height * 0.22, 0]} size={[1.5, height * 0.44, 1.05]} paint={color.wood} />
    <Box at={[0, height * 0.48, 0]} size={[1.7, 0.1, 1.25]} paint={color.roof} />
  </>;
}

function CityWall({ height }: { height: number }) {
  return <>
    <Box at={[0, height * 0.42, -5.2]} size={[14.8, height * 0.84, 0.3]} paint={color.sandstone} />
    <Box at={[0, height * 0.42, 4.9]} size={[14.8, height * 0.84, 0.3]} paint={color.sandstone} />
    <Box at={[-7.25, height * 0.42, -0.15]} size={[0.3, height * 0.84, 10.4]} paint={color.sandstone} />
    <Box at={[7.25, height * 0.42, -0.15]} size={[0.3, height * 0.84, 10.4]} paint={color.sandstone} />
    {[-7.25, 7.25].flatMap((x) => [-5.2, 4.9].map((z) => <Tower key={`${x}:${z}`} x={x} z={z} height={height * 1.45} radius={0.36} />))}
    <Box at={[0, height * 0.4, 4.98]} size={[1.05, height * 0.8, 0.07]} paint={color.dark} />
    <Tower x={-0.75} z={4.9} height={height * 1.45} radius={0.25} />
    <Tower x={0.75} z={4.9} height={height * 1.45} radius={0.25} />
  </>;
}

function Structure({ building, height }: { building: Building; height: number }) {
  switch (building) {
    case 'hall': return <Hall height={height} />;
    case 'lumber': return <Lumber height={height} />;
    case 'quarry': return <Quarry height={height} />;
    case 'mine': return <Mine height={height} />;
    case 'farm': return <Farm height={height} />;
    case 'treasury': return <Treasury height={height} />;
    case 'warehouse': return <Warehouse height={height} />;
    case 'barracks': return <Barracks height={height} />;
    case 'stable': return <StableYard height={height} />;
    case 'wall': return <CityWall height={height} />;
    case 'market': return <Market height={height} />;
    case 'embassy': return <Embassy height={height} />;
  }
}

function Scaffold({ height, progress }: { height: number; progress: number }) {
  const visibleHeight = Math.max(0.45, height * (0.3 + progress * 0.7));
  return <group>
    {[-0.72, 0.72].flatMap((x) => [-0.72, 0.72].map((z) =>
      <Cylinder key={`${x}:${z}`} at={[x, visibleHeight / 2, z]} radius={0.035} height={visibleHeight} paint={color.wood} sides={5} />))}
    <Box at={[0, visibleHeight * 0.45, 0]} size={[1.55, 0.06, 1.55]} paint={color.construction} />
    <Box at={[0, visibleHeight * 0.85, 0]} size={[1.55, 0.06, 1.55]} paint={color.construction} />
  </group>;
}

export function KingdomSceneGeometry({ buildings, selected, onSelect }: {
  buildings: SceneBuilding[];
  selected: Building | null;
  onSelect: (building: Building) => void;
}) {
  return <>
    <color attach="background" args={['#bad0cc']} />
    <hemisphereLight args={['#fff4dc', '#9a7252', 2.1]} />
    <directionalLight position={[-5, 10, 5]} intensity={2.25} color="#fff0ca" />
    <Plaza />
    {buildings.map((item) => {
      const [x, z] = scenePlots[item.key];
      const height = (0.78 + item.level * 0.065 + item.progress * 0.065) * (item.key === 'hall' ? 1.95 : 1);
      const onClick = (event: ThreeEvent<MouseEvent>) => { event.stopPropagation(); onSelect(item.key); };
      return <group key={item.key} position={[x, 0, z]} onClick={onClick}>
        {item.key !== 'wall' && <>
          <Cylinder at={[0, 0.035, 0]} radius={item.key === 'hall' ? 1.8 : 1.05} height={0.07} paint={selected === item.key ? color.gold : color.light} sides={8} />
          {!item.built && !item.busy && <Cylinder at={[0, 0.045, 0]} radius={0.7} height={0.03} paint={color.sand} sides={8} />}
        </>}
        {item.built && <Structure building={item.key} height={height} />}
        {item.busy && <Scaffold height={height * (item.key === 'wall' ? 1.5 : 1)} progress={item.progress} />}
        {item.key === 'wall' && !item.built && !item.busy && <>
          <Box at={[0, 0.02, -5.2]} size={[14.8, 0.04, 0.14]} paint={color.light} />
          <Box at={[0, 0.02, 4.9]} size={[14.8, 0.04, 0.14]} paint={color.light} />
        </>}
      </group>;
    })}
  </>;
}

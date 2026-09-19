'use client';

import { memo, Suspense, useMemo } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { getOrientedSquares } from './chess-coordinates';
import { ChessSquare } from './ChessSquare';

const BOARD_BASE_GEOMETRY = new THREE.BoxGeometry(9.7, 0.42, 9.7);
const BOARD_RIM_GEOMETRY = new THREE.BoxGeometry(9.2, 0.24, 9.2);
const BOARD_TEXTURE_GEOMETRY = new THREE.PlaneGeometry(7.88, 7.88);

const BOARD_BASE_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#0a1f3d',
  roughness: 0.44,
  metalness: 0.16,
});
const BOARD_RIM_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#0a2c5c',
  roughness: 0.5,
  metalness: 0.08,
});

const CLASSIC_BOARD_URL = '/chess/classic-board.png';

function ClassicBoardSurface() {
  const loaded = useLoader(THREE.TextureLoader, CLASSIC_BOARD_URL);
  const texture = useMemo(() => {
    const t = loaded.clone();
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  }, [loaded]);

  return (
    <mesh
      geometry={BOARD_TEXTURE_GEOMETRY}
      position={[0, -0.072, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
    >
      <meshStandardMaterial
        map={texture}
        roughness={0.62}
        metalness={0.05}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </mesh>
  );
}

type ChessBoard3DProps = Readonly<{
  interactive: boolean;
  onSquarePress: (square: string) => void;
  useClassicBoard?: boolean;
}>;

function ChessBoard3DComponent({
  interactive,
  onSquarePress,
  useClassicBoard = false,
}: ChessBoard3DProps) {
  return (
    <group>
      <mesh
        dispose={null}
        geometry={BOARD_RIM_GEOMETRY}
        material={BOARD_RIM_MATERIAL}
        position={[0, -0.08, 0]}
        receiveShadow
      />
      <mesh
        dispose={null}
        geometry={BOARD_BASE_GEOMETRY}
        material={BOARD_BASE_MATERIAL}
        position={[0, -0.3, 0]}
        receiveShadow
      />
      {useClassicBoard ? (
        <Suspense fallback={null}>
          <ClassicBoardSurface />
        </Suspense>
      ) : null}
      {getOrientedSquares('white').map((square) => (
        <ChessSquare
          key={square}
          square={square}
          interactive={interactive}
          onSquarePress={onSquarePress}
        />
      ))}
    </group>
  );
}

export const ChessBoard3D = memo(ChessBoard3DComponent);

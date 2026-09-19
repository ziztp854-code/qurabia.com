'use client';

import { memo, useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { squareToBoardPosition, type ChessSquare } from './chess-coordinates';
import type { ChessPieceColor, ChessPieceType, ChessSceneQuality } from './chess-3d-model';

function lathe(points: ReadonlyArray<readonly [number, number]>) {
  return new THREE.LatheGeometry(
    points.map(([radius, y]) => new THREE.Vector2(radius, y)),
    36,
  );
}

function knightGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.42, 0);
  shape.lineTo(0.42, 0);
  shape.lineTo(0.33, 0.22);
  shape.lineTo(0.18, 0.38);
  shape.lineTo(0.12, 0.76);
  shape.lineTo(0.35, 1.14);
  shape.lineTo(0.25, 1.48);
  shape.lineTo(-0.1, 1.62);
  shape.lineTo(-0.38, 1.43);
  shape.lineTo(-0.2, 1.22);
  shape.lineTo(-0.34, 0.9);
  shape.lineTo(-0.3, 0.42);
  shape.lineTo(-0.42, 0);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.34,
    bevelEnabled: true,
    bevelSize: 0.05,
    bevelThickness: 0.05,
    bevelSegments: 1,
  });
  geometry.translate(0, 0, -0.17);
  return geometry;
}

const PIECE_GEOMETRIES: Readonly<Record<ChessPieceType, THREE.BufferGeometry>> = {
  pawn: lathe([
    [0.34, 0],
    [0.42, 0.12],
    [0.36, 0.23],
    [0.21, 0.3],
    [0.16, 0.74],
    [0.3, 0.9],
    [0.27, 1.15],
    [0, 1.29],
  ]),
  knight: knightGeometry(),
  bishop: lathe([
    [0.4, 0],
    [0.46, 0.13],
    [0.37, 0.26],
    [0.2, 0.35],
    [0.16, 0.96],
    [0.28, 1.1],
    [0.2, 1.38],
    [0, 1.58],
  ]),
  rook: lathe([
    [0.44, 0],
    [0.48, 0.14],
    [0.39, 0.27],
    [0.31, 0.36],
    [0.28, 1.14],
    [0.42, 1.2],
    [0.43, 1.48],
    [0.28, 1.48],
    [0.28, 1.36],
    [0, 1.36],
  ]),
  queen: lathe([
    [0.45, 0],
    [0.5, 0.15],
    [0.4, 0.28],
    [0.22, 0.38],
    [0.18, 1.08],
    [0.36, 1.25],
    [0.26, 1.43],
    [0.34, 1.58],
    [0.16, 1.69],
    [0, 1.84],
  ]),
  king: lathe([
    [0.46, 0],
    [0.51, 0.15],
    [0.41, 0.29],
    [0.23, 0.4],
    [0.19, 1.14],
    [0.36, 1.3],
    [0.24, 1.5],
    [0.12, 1.57],
    [0.12, 1.82],
    [0.23, 1.82],
    [0.23, 1.94],
    [0, 1.94],
  ]),
};

const WHITE_MATERIAL = new THREE.MeshPhysicalMaterial({
  color: '#e8dcc8',
  roughness: 0.24,
  metalness: 0.06,
  clearcoat: 0.72,
  clearcoatRoughness: 0.18,
});
const BLACK_MATERIAL = new THREE.MeshPhysicalMaterial({
  color: '#554d47',
  roughness: 0.34,
  metalness: 0.18,
  clearcoat: 0.9,
  clearcoatRoughness: 0.12,
});

const HEAD_GEOMETRY = new THREE.SphereGeometry(0.27, 28, 18);
const SMALL_HEAD_GEOMETRY = new THREE.SphereGeometry(0.2, 24, 16);
const CROSS_VERTICAL_GEOMETRY = new THREE.BoxGeometry(0.12, 0.42, 0.12);
const CROSS_HORIZONTAL_GEOMETRY = new THREE.BoxGeometry(0.34, 0.11, 0.12);
const ROOK_TOOTH_GEOMETRY = new THREE.BoxGeometry(0.18, 0.22, 0.18);

function PieceDetails({
  type,
  material,
}: Readonly<{ type: ChessPieceType; material: THREE.Material }>) {
  if (type === 'pawn') {
    return <mesh geometry={HEAD_GEOMETRY} material={material} position={[0, 1.17, 0]} />;
  }

  if (type === 'bishop') {
    return (
      <mesh
        geometry={SMALL_HEAD_GEOMETRY}
        material={material}
        position={[0, 1.46, 0]}
        scale={[0.8, 1.2, 0.8]}
      />
    );
  }

  if (type === 'king') {
    return (
      <group position={[0, 1.9, 0]}>
        <mesh geometry={CROSS_VERTICAL_GEOMETRY} material={material} />
        <mesh geometry={CROSS_HORIZONTAL_GEOMETRY} material={material} position={[0, 0.04, 0]} />
      </group>
    );
  }

  if (type === 'queen') {
    return (
      <group position={[0, 1.67, 0]}>
        {[-0.24, 0, 0.24].map((x) => (
          <mesh
            key={x}
            geometry={SMALL_HEAD_GEOMETRY}
            material={material}
            position={[x, Math.abs(x) * 0.25, 0]}
            scale={0.42}
          />
        ))}
      </group>
    );
  }

  if (type === 'rook') {
    return (
      <group position={[0, 1.48, 0]}>
        {[
          [-0.27, 0, -0.27],
          [0.27, 0, -0.27],
          [-0.27, 0, 0.27],
          [0.27, 0, 0.27],
        ].map(([x, y, z]) => (
          <mesh
            key={`${x}-${z}`}
            geometry={ROOK_TOOTH_GEOMETRY}
            material={material}
            position={[x, y, z]}
          />
        ))}
      </group>
    );
  }

  return null;
}

type ChessPiece3DProps = Readonly<{
  type: ChessPieceType;
  color: ChessPieceColor;
  square: ChessSquare;
  moveFrom: ChessSquare | null;
  quality: ChessSceneQuality;
  reducedMotion: boolean;
}>;

function ChessPiece3DComponent({
  type,
  color,
  square,
  moveFrom,
  quality,
  reducedMotion,
}: ChessPiece3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const progressRef = useRef(1);
  const invalidate = useThree((state) => state.invalidate);
  const [destinationX, , destinationZ] = squareToBoardPosition(square);
  const material = color === 'white' ? WHITE_MATERIAL : BLACK_MATERIAL;

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    if (!moveFrom || reducedMotion) {
      progressRef.current = 1;
      group.position.set(destinationX, 0.08, destinationZ);
      invalidate();
      return;
    }

    const start = squareToBoardPosition(moveFrom);
    progressRef.current = 0;
    group.position.set(start[0], 0.08, start[2]);
    invalidate();
  }, [destinationX, destinationZ, invalidate, moveFrom, reducedMotion]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group || progressRef.current >= 1 || !moveFrom) return;
    progressRef.current = Math.min(1, progressRef.current + delta / 0.22);
    const start = squareToBoardPosition(moveFrom);
    const progress = 1 - Math.pow(1 - progressRef.current, 3);
    group.position.set(
      THREE.MathUtils.lerp(start[0], destinationX, progress),
      0.08 + Math.sin(progress * Math.PI) * 0.22,
      THREE.MathUtils.lerp(start[2], destinationZ, progress),
    );
    if (progressRef.current < 1) invalidate();
  });

  return (
    <group ref={groupRef} position={[destinationX, 0.08, destinationZ]}>
      <mesh
        dispose={null}
        geometry={PIECE_GEOMETRIES[type]}
        material={material}
        scale={0.79}
        castShadow={quality === 'high'}
        receiveShadow={quality !== 'low'}
      />
      <group scale={0.79}>
        <PieceDetails type={type} material={material} />
      </group>
    </group>
  );
}

export const ChessPiece3D = memo(ChessPiece3DComponent);

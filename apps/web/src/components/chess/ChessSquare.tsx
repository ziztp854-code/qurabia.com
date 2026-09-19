'use client';

import { memo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { squareToBoardPosition, type ChessSquare as ChessSquareName } from './chess-coordinates';

const SQUARE_GEOMETRY = new THREE.BoxGeometry(0.985, 0.14, 0.985);
const LIGHT_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#f5eddc',
  roughness: 0.62,
  metalness: 0.03,
});
const DARK_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#2f7d57',
  roughness: 0.66,
  metalness: 0.04,
});

type ChessSquareProps = Readonly<{
  square: ChessSquareName;
  interactive: boolean;
  onSquarePress: (square: string) => void;
}>;

function ChessSquareComponent({ square, interactive, onSquarePress }: ChessSquareProps) {
  const [x, , z] = squareToBoardPosition(square);
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  const dark = (file + rank) % 2 === 1;

  return (
    <mesh
      dispose={null}
      geometry={SQUARE_GEOMETRY}
      material={dark ? DARK_MATERIAL : LIGHT_MATERIAL}
      position={[x, 0, z]}
      receiveShadow
      onPointerDown={(event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation();
        if (interactive) onSquarePress(square);
      }}
    />
  );
}

export const ChessSquare = memo(ChessSquareComponent);

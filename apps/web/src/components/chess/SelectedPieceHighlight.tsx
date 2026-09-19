'use client';

import * as THREE from 'three';
import { squareToBoardPosition } from './chess-coordinates';
import { isChessSquare } from './chess-3d-model';

const SELECTED_GEOMETRY = new THREE.RingGeometry(0.34, 0.47, 32);
const SELECTED_MATERIAL = new THREE.MeshBasicMaterial({
  color: '#fff0a6',
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.92,
  depthWrite: false,
});

export function SelectedPieceHighlight({ selected }: Readonly<{ selected: string | null }>) {
  if (!isChessSquare(selected)) return null;
  const [x, , z] = squareToBoardPosition(selected);

  return (
    <mesh
      dispose={null}
      geometry={SELECTED_GEOMETRY}
      material={SELECTED_MATERIAL}
      position={[x, 0.11, z]}
      rotation={[-Math.PI / 2, 0, 0]}
    />
  );
}

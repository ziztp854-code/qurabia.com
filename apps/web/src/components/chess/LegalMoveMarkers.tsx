'use client';

import { memo } from 'react';
import * as THREE from 'three';
import { squareToBoardPosition } from './chess-coordinates';
import { isChessSquare } from './chess-3d-model';

const MARKER_GEOMETRY = new THREE.CylinderGeometry(0.14, 0.14, 0.025, 20);
const MARKER_MATERIAL = new THREE.MeshBasicMaterial({
  color: '#f4c86a',
  transparent: true,
  opacity: 0.72,
  depthWrite: false,
});

type LegalMoveMarkersProps = Readonly<{ legal: readonly string[] }>;

function LegalMoveMarkersComponent({ legal }: LegalMoveMarkersProps) {
  return (
    <group>
      {legal.filter(isChessSquare).map((square) => {
        const [x, , z] = squareToBoardPosition(square);
        return (
          <mesh
            key={square}
            dispose={null}
            geometry={MARKER_GEOMETRY}
            material={MARKER_MATERIAL}
            position={[x, 0.095, z]}
          />
        );
      })}
    </group>
  );
}

export const LegalMoveMarkers = memo(LegalMoveMarkersComponent);

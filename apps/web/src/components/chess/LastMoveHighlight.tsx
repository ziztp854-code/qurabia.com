'use client';

import * as THREE from 'three';
import { squareToBoardPosition } from './chess-coordinates';
import { isChessSquare, type ChessLastMove } from './chess-3d-model';

const LAST_MOVE_GEOMETRY = new THREE.PlaneGeometry(0.86, 0.86);
const LAST_MOVE_MATERIAL = new THREE.MeshBasicMaterial({
  color: '#d89019',
  transparent: true,
  opacity: 0.34,
  side: THREE.DoubleSide,
  depthWrite: false,
});

export function LastMoveHighlight({ lastMove }: Readonly<{ lastMove: ChessLastMove | null }>) {
  if (!lastMove || !isChessSquare(lastMove.from) || !isChessSquare(lastMove.to)) return null;

  return (
    <group>
      {[lastMove.from, lastMove.to].map((square) => {
        const [x, , z] = squareToBoardPosition(square);
        return (
          <mesh
            key={square}
            dispose={null}
            geometry={LAST_MOVE_GEOMETRY}
            material={LAST_MOVE_MATERIAL}
            position={[x, 0.085, z]}
            rotation={[-Math.PI / 2, 0, 0]}
          />
        );
      })}
    </group>
  );
}

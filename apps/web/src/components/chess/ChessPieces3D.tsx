'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { squareToBoardPosition } from './chess-coordinates';
import { ChessPiece3D } from './ChessPiece3D';
import {
  deriveMoveTransition,
  type ChessLastMove,
  type ChessSceneQuality,
  type SceneChessPiece,
} from './chess-3d-model';

const CAPTURE_GEOMETRY = new THREE.RingGeometry(0.18, 0.5, 28);
const CAPTURE_MATERIAL = new THREE.MeshBasicMaterial({
  color: '#ff7043',
  transparent: true,
  opacity: 0.8,
  side: THREE.DoubleSide,
  depthWrite: false,
});

function CapturePulse({ square }: Readonly<{ square: SceneChessPiece['square'] }>) {
  const meshRef = useRef<THREE.Mesh>(null);
  const progressRef = useRef(0);
  const invalidate = useThree((state) => state.invalidate);
  const [x, , z] = squareToBoardPosition(square);

  useEffect(() => {
    progressRef.current = 0;
    invalidate();
  }, [invalidate, square]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh || progressRef.current >= 1) return;
    progressRef.current = Math.min(1, progressRef.current + delta / 0.3);
    mesh.scale.setScalar(0.65 + progressRef.current * 0.65);
    if (progressRef.current < 1) invalidate();
  });

  return (
    <mesh
      ref={meshRef}
      dispose={null}
      geometry={CAPTURE_GEOMETRY}
      material={CAPTURE_MATERIAL}
      position={[x, 0.14, z]}
      rotation={[-Math.PI / 2, 0, 0]}
    />
  );
}

type ChessPieces3DProps = Readonly<{
  pieces: readonly SceneChessPiece[];
  lastMove: ChessLastMove | null;
  quality: ChessSceneQuality;
  reducedMotion: boolean;
}>;

function ChessPieces3DComponent({ pieces, lastMove, quality, reducedMotion }: ChessPieces3DProps) {
  const previousPiecesRef = useRef<readonly SceneChessPiece[]>(pieces);
  const [transition, setTransition] = useState(() =>
    deriveMoveTransition(pieces, pieces, lastMove),
  );

  useEffect(() => {
    setTransition(deriveMoveTransition(previousPiecesRef.current, pieces, lastMove));
    previousPiecesRef.current = pieces;
  }, [lastMove, pieces]);

  return (
    <group>
      {pieces.map((piece) => {
        const isMovedPiece = transition?.to === piece.square;
        return (
          <ChessPiece3D
            key={`${piece.color}-${piece.type}-${piece.square}`}
            type={piece.type}
            color={piece.color}
            square={piece.square}
            moveFrom={isMovedPiece ? transition.from : null}
            quality={quality}
            reducedMotion={reducedMotion}
          />
        );
      })}
      {transition?.isCapture && !reducedMotion ? <CapturePulse square={transition.to} /> : null}
    </group>
  );
}

export const ChessPieces3D = memo(ChessPieces3DComponent);

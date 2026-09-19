'use client';

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { squareToBoardPosition } from './chess-coordinates';
import { isChessSquare } from './chess-3d-model';

const CHECK_GEOMETRY = new THREE.RingGeometry(0.31, 0.5, 32);
const CHECK_MATERIAL = new THREE.MeshBasicMaterial({
  color: '#ef5350',
  transparent: true,
  opacity: 0.88,
  side: THREE.DoubleSide,
  depthWrite: false,
});

type CheckHighlightProps = Readonly<{
  check: string | null;
  reducedMotion: boolean;
}>;

export function CheckHighlight({ check, reducedMotion }: CheckHighlightProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const progressRef = useRef(1);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    progressRef.current = reducedMotion ? 1 : 0;
    if (!reducedMotion && isChessSquare(check)) invalidate();
  }, [check, invalidate, reducedMotion]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh || progressRef.current >= 1) return;
    progressRef.current = Math.min(1, progressRef.current + delta / 0.7);
    const pulse = 1 + Math.sin(progressRef.current * Math.PI * 3) * 0.12;
    mesh.scale.setScalar(pulse);
    if (progressRef.current < 1) invalidate();
  });

  if (!isChessSquare(check)) return null;
  const [x, , z] = squareToBoardPosition(check);

  return (
    <mesh
      ref={meshRef}
      dispose={null}
      geometry={CHECK_GEOMETRY}
      material={CHECK_MATERIAL}
      position={[x, 0.12, z]}
      rotation={[-Math.PI / 2, 0, 0]}
    />
  );
}

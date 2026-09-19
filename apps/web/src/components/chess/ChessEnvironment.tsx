'use client';

import * as THREE from 'three';
import type { ChessSceneQuality } from './chess-3d-model';

const FLOOR_GEOMETRY = new THREE.PlaneGeometry(40, 40);
const FLOOR_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#dfe9dd',
  roughness: 0.82,
  metalness: 0,
});

export function ChessEnvironment({ quality }: Readonly<{ quality: ChessSceneQuality }>) {
  return (
    <>
      <color attach="background" args={['#eef4ea']} />
      {quality === 'high' ? <fog attach="fog" args={['#eef4ea', 13, 25]} /> : null}
      <mesh
        dispose={null}
        geometry={FLOOR_GEOMETRY}
        material={FLOOR_MATERIAL}
        position={[0, -0.38, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      />
    </>
  );
}

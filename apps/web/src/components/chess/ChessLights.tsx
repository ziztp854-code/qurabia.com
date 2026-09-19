'use client';

import type { ChessSceneQuality } from './chess-3d-model';

export function ChessLights({ quality }: Readonly<{ quality: ChessSceneQuality }>) {
  return (
    <>
      <ambientLight intensity={quality === 'low' ? 1.35 : 1.25} />
      <directionalLight
        color="#fff2cf"
        intensity={quality === 'low' ? 1.55 : 1.95}
        position={[4.5, 9, 6]}
        castShadow={quality === 'high'}
        shadow-mapSize-width={768}
        shadow-mapSize-height={768}
        shadow-camera-near={1}
        shadow-camera-far={24}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
      />
      {quality === 'high' ? (
        <>
          <pointLight color="#dfffea" intensity={2.8} distance={17} position={[-5, 4, -4]} />
          <pointLight color="#fff6dc" intensity={3} distance={15} position={[0, 4, 8]} />
        </>
      ) : null}
    </>
  );
}

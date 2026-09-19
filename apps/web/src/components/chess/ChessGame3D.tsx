'use client';

/*
 * THESIS: a focused, premium chess table that keeps the live match readable.
 * OWN-WORLD: Qurabia's dark navy arena, restrained gold, and cool blue accents.
 * STORY: opponent and clock, authoritative board state, then match controls/history.
 * FIRST VIEWPORT: the entire board and both clocks remain visible before secondary detail.
 * FORM: polished procedural pieces and a perspective camera; no decorative model dependency.
 */

import { Canvas } from '@react-three/fiber';
import { ChessScene3D } from './ChessScene3D';
import type { Chess3DPresentationProps } from './chess-3d-model';

const DPR_BY_QUALITY = {
  low: 1,
  medium: [1, 1.25] as [number, number],
  high: [1, 1.5] as [number, number],
};

export type ChessGame3DProps = Chess3DPresentationProps;

export function ChessGame3D(props: ChessGame3DProps) {
  const { quality } = props;

  return (
    <div
      aria-hidden="true"
      data-chess-scene="3d"
      style={{
        position: 'relative',
        width: '100%',
        minHeight: 280,
        aspectRatio: '16 / 10',
        overflow: 'hidden',
        borderRadius: 'inherit',
      }}
    >
      <Canvas
        frameloop="demand"
        camera={{ position: [0, 7.4, 9.6], fov: 40, near: 0.1, far: 100 }}
        dpr={DPR_BY_QUALITY[quality]}
        shadows={quality === 'high'}
        performance={{ min: 0.55, debounce: 240 }}
        gl={{
          alpha: false,
          antialias: quality !== 'low',
          powerPreference: quality === 'low' ? 'low-power' : 'default',
        }}
        fallback={<div data-chess-scene-fallback="webgl" />}
      >
        <ChessScene3D {...props} />
      </Canvas>
    </div>
  );
}

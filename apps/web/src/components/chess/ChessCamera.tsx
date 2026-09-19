'use client';

/* eslint-disable react-hooks/immutability -- R3F cameras are imperative scene objects updated inside the frame loop. */

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { ChessCameraMode, ChessPieceColor } from './chess-3d-model';

const LOOK_AT = new THREE.Vector3(0, -0.7, 0);

function cameraPreset(mode: ChessCameraMode, orientation: ChessPieceColor) {
  const side = orientation === 'white' ? 1 : -1;
  if (mode === 'top') return new THREE.Vector3(0, 13.5, side * 0.01);
  if (mode === 'cinematic') return new THREE.Vector3(-side * 7.2, 7.4, side * 9.4);
  return new THREE.Vector3(0, 7.4, side * 9.6);
}

type ChessCameraProps = Readonly<{
  orientation: ChessPieceColor;
  cameraMode: ChessCameraMode;
  reducedMotion: boolean;
}>;

export function ChessCamera({ orientation, cameraMode, reducedMotion }: ChessCameraProps) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  const targetRef = useRef(cameraPreset(cameraMode, orientation));
  const targetZoomRef = useRef(48);
  const movingRef = useRef(false);

  useEffect(() => {
    targetRef.current = cameraPreset(cameraMode, orientation);
    const sceneSpan = cameraMode === 'cinematic' ? 12.5 : 10.5;
    targetZoomRef.current = Math.min(size.width, size.height) / sceneSpan;
    movingRef.current = true;
    invalidate();
  }, [cameraMode, invalidate, orientation, size.height, size.width]);

  useFrame((_, delta) => {
    if (!movingRef.current) return;
    if (camera instanceof THREE.OrthographicCamera) {
      camera.zoom = targetZoomRef.current;
    }
    if (reducedMotion) {
      camera.position.copy(targetRef.current);
      camera.lookAt(LOOK_AT);
      camera.updateProjectionMatrix();
      movingRef.current = false;
      return;
    }
    const alpha = 1 - Math.exp(-delta * 9);
    camera.position.lerp(targetRef.current, alpha);
    camera.lookAt(LOOK_AT);
    camera.updateProjectionMatrix();
    if (camera.position.distanceToSquared(targetRef.current) < 0.0005) {
      camera.position.copy(targetRef.current);
      movingRef.current = false;
    } else {
      invalidate();
    }
  });

  return null;
}

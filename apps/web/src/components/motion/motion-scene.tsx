'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { type GameMotionScene, getGameSceneMotion } from '@/lib/motion';

export function MotionScene({
  children,
  scene,
  sceneKey = scene,
}: {
  children: ReactNode;
  scene: GameMotionScene;
  sceneKey?: string | number;
}) {
  const reduceMotion = useReducedMotion();
  const sceneMotion = getGameSceneMotion(scene, Boolean(reduceMotion));

  return (
    <motion.div key={sceneKey} data-motion-scene={scene} {...sceneMotion}>
      {children}
    </motion.div>
  );
}

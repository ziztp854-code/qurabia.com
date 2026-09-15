import type { Variants } from 'framer-motion';

export const motionDurations = { fast: 0.16, normal: 0.28, slow: 0.5, countdown: 0.8 } as const;
export const motionEasings = { standard: [0.2, 0, 0, 1], enter: [0, 0, 0.2, 1] } as const;
const standardCssEasing = 'cubic-bezier(0.2, 0, 0, 1)';
export const motionVariants: Record<string, Variants> = {
  page: { hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } },
  card: { hidden: { opacity: 0, scale: 0.98 }, visible: { opacity: 1, scale: 1 } },
  score: { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, scale: [1, 1.08, 1] } },
  countdown: { hidden: { opacity: 0, scale: 0.5 }, visible: { opacity: 1, scale: 1 } },
};

export type GameMotionScene = 'intro' | 'question' | 'reveal' | 'finished';

export function getRouteEntranceMotion(reduceMotion = false) {
  if (reduceMotion) return null;

  return {
    keyframes: [{ opacity: 0.01 }, { opacity: 1 }],
    options: {
      duration: motionDurations.normal * 1000,
      easing: standardCssEasing,
    },
  };
}

export function getGameMotionScene(phase?: string | null): GameMotionScene {
  if (!phase || phase === 'join' || phase === 'waiting' || phase === 'lobby' || phase === 'setup' || phase === 'board') {
    return 'intro';
  }
  if (phase.includes('finished') || phase.includes('final') || phase.includes('end')) {
    return 'finished';
  }
  if (phase.includes('reveal') || phase.includes('result') || phase.includes('verdict') || phase === 'answer') {
    return 'reveal';
  }
  return 'question';
}

export function getGameSceneMotion(scene: GameMotionScene, reduceMotion = false) {
  const y = scene === 'reveal' ? 10 : 16;
  const scale = scene === 'finished' ? 0.98 : 1;

  return {
    initial: reduceMotion ? false : { y, scale },
    animate: { y: 0, scale: 1 },
    transition: { duration: reduceMotion ? 0 : motionDurations.normal, ease: motionEasings.standard },
  };
}

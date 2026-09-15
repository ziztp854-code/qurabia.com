import { describe, expect, it } from 'vitest';
import {
  getGameMotionScene,
  getGameSceneMotion,
  getRouteEntranceMotion,
  motionDurations,
} from './motion';

describe('getRouteEntranceMotion', () => {
  it('uses a short opacity-only entrance that cannot shift the page layout', () => {
    const motion = getRouteEntranceMotion();

    expect(motion).toEqual({
      keyframes: [{ opacity: 0.01 }, { opacity: 1 }],
      options: {
        duration: motionDurations.normal * 1000,
        easing: 'cubic-bezier(0.2, 0, 0, 1)',
      },
    });
  });

  it('removes the route entrance when reduced motion is requested', () => {
    expect(getRouteEntranceMotion(true)).toBeNull();
  });
});

describe('getGameSceneMotion', () => {
  it('uses one short transform-and-opacity transition for game scene changes', () => {
    const motion = getGameSceneMotion('reveal');

    expect(motion.initial).toEqual({ y: 10, scale: 1 });
    expect(motion.animate).toEqual({ y: 0, scale: 1 });
    expect(motion.transition.duration).toBe(motionDurations.normal);
  });

  it('removes scene motion when reduced motion is requested', () => {
    const motion = getGameSceneMotion('finished', true);

    expect(motion.initial).toBe(false);
    expect(motion.transition.duration).toBe(0);
  });
});

describe('getGameMotionScene', () => {
  it('maps game and quiz status names to presentation-only scenes', () => {
    expect(getGameMotionScene('parallel-answering')).toBe('question');
    expect(getGameMotionScene('REVEAL'.toLowerCase())).toBe('reveal');
    expect(getGameMotionScene('finished')).toBe('finished');
    expect(getGameMotionScene('lobby')).toBe('intro');
  });
});

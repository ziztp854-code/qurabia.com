'use client';

// Adapted from David Haz's React Bits Noise. See THIRD_PARTY.md and LICENSE.md.
import { useEffect, useRef } from 'react';
import { useMotionActivity } from '@/components/motion/use-motion-activity';
import styles from './react-bits.module.css';

const TILE = 128;
const clamp = (value: number) => Math.min(1, Math.max(0, value));
const generator = (seed: number) => {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Upstream grain generator, without dust, full-screen canvas or its RAF loop. */
export default function Noise() {
  const rootRef = useRef<HTMLDivElement>(null);
  const grainRef = useRef<HTMLDivElement>(null);
  useMotionActivity(rootRef);
  useEffect(() => {
    const grain = grainRef.current;
    if (!grain) return;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = TILE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const image = ctx.createImageData(TILE, TILE);
    const random = generator(1013904223);
    for (let i = 0; i < image.data.length; i += 4) {
      const value = clamp(0.5 + (random() + random() - 1) * 1.16) * 255;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
      image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    let alive = true;
    let url = '';
    canvas.toBlob((blob) => {
      if (!alive || !blob) return;
      url = URL.createObjectURL(blob);
      grain.style.backgroundImage = `url("${url}")`;
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, []);
  return (
    <div ref={rootRef} className={styles.noise} aria-hidden="true" data-react-bits="Noise">
      <div ref={grainRef} className={styles.grain} />
    </div>
  );
}

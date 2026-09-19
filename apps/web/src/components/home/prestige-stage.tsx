'use client';

import Image from 'next/image';
import { useEffect, useRef, type ReactNode } from 'react';
import styles from './prestige-home.module.css';

export function PrestigeStage({ children }: { children: ReactNode }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const lionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = frameRef.current;
    const lion = lionRef.current;
    if (!frame || !lion) return;

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motion.matches) return;

    const onMove = (event: PointerEvent) => {
      const box = frame.getBoundingClientRect();
      const px = (event.clientX - box.left) / box.width - 0.5;
      const py = (event.clientY - box.top) / box.height - 0.5;
      lion.style.setProperty('--lion-x', `${(px * 6).toFixed(2)}px`);
      lion.style.setProperty('--lion-y', `${(py * 4).toFixed(2)}px`);
    };
    const reset = () => {
      lion.style.removeProperty('--lion-x');
      lion.style.removeProperty('--lion-y');
    };

    frame.addEventListener('pointermove', onMove);
    frame.addEventListener('pointerleave', reset);
    return () => {
      frame.removeEventListener('pointermove', onMove);
      frame.removeEventListener('pointerleave', reset);
    };
  }, []);

  return (
    <div className={styles.stage} ref={frameRef} data-home-hero>
      <Image
        className={styles.heroBackground}
        src="/home/tahaddi-hero-background-3344x1882.webp"
        alt=""
        fill
        priority
        sizes="100vw"
      />
      <div className={styles.particles} aria-hidden="true" data-layer="particles">
        {Array.from({ length: 10 }, (_, index) => <span key={index} />)}
      </div>
      <div className={styles.trophyLayer} aria-hidden="true" data-layer="trophy">
        <Image
          src="/home/tahaddi-trophy-ornate-transparent.png"
          alt=""
          width={1024}
          height={1536}
          sizes="(max-width: 767px) 54vw, (max-width: 1100px) 23rem, 27vw"
          priority
        />
        <span className={styles.trophyShine} data-layer="shine-trophy" />
      </div>
      <div className={styles.lionLayer} ref={lionRef} aria-hidden="true" data-layer="lion">
        <Image
          src="/home/tahaddi-lion-transparent-1322x1190.webp"
          alt=""
          width={1322}
          height={1190}
          sizes="(max-width: 767px) 66vw, (max-width: 1100px) 30rem, 36vw"
          priority
        />
      </div>
      <div className={styles.crownLayer} aria-hidden="true" data-layer="crown">
        <Image
          src="/home/tahaddi-crown-transparent-1024x683.webp"
          alt=""
          width={1024}
          height={683}
          sizes="(max-width: 767px) 7.5rem, (max-width: 1100px) 11rem, 14vw"
          priority
        />
        <span className={styles.crownShine} data-layer="shine-crown" />
      </div>
      <div className={styles.heroContent} data-layer="content">{children}</div>
    </div>
  );
}

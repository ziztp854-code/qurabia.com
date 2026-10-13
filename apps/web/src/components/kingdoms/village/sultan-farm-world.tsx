'use client';

import { useEffect, useRef } from 'react';
import { ArrowRight, Flower2 } from 'lucide-react';
import type { GameProps } from '../shared';
import styles from './sultan-farm-world.module.css';

export function SultanFarmWorld({
  farm,
  onClose,
  onGarden,
}: {
  farm: GameProps;
  onClose: () => void;
  onGarden: () => void;
}) {
  const surface = useRef<HTMLElement>(null),
    back = useRef<HTMLButtonElement>(null),
    frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const returnMessage = (event: MessageEvent) => {
      if (
        event.origin === window.location.origin &&
        event.source === frame.current?.contentWindow &&
        event.data?.type === 'sultan-farm-return'
      )
        onClose();
    };
    window.addEventListener('message', returnMessage);
    return () => window.removeEventListener('message', returnMessage);
  }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const covered: HTMLElement[] = [];
    let branch: HTMLElement | null = surface.current;
    while (branch?.parentElement) {
      const parent = branch.parentElement;
      for (const sibling of Array.from(parent.children))
        if (sibling instanceof HTMLElement && sibling !== branch && !sibling.inert) {
          sibling.inert = true;
          covered.push(sibling);
        }
      branch = parent;
    }
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    back.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = overflow;
      covered.forEach((element) => {
        element.inert = false;
      });
      previous?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <section
      ref={surface}
      className={styles.world}
      dir="rtl"
      aria-label="مشهد مزرعة السلطان"
      data-city-scene="sultan-garden"
      data-farm-world="3d"
      data-phase="active"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
        if (event.key === 'Tab' && event.shiftKey && document.activeElement === back.current) {
          event.preventDefault();
          surface.current?.querySelector<HTMLIFrameElement>('iframe')?.focus();
        }
      }}
    >
      <header className={styles.toolbar}>
        <button ref={back} className={styles.back} type="button" onClick={onClose}>
          <ArrowRight size={18} aria-hidden="true" />
          العودة إلى القرية
        </button>
        <span>مزرعة السلطان · ازرع وابنِ وتاجر</span>
        <button className={styles.garden} type="button" onClick={onGarden}>
          <Flower2 size={16} aria-hidden="true" />
          حديقة القصر
        </button>
      </header>
      <iframe
        ref={frame}
        className={styles.frame}
        title="مزرعة السلطان ثلاثية الأبعاد"
        src={`/games/sultan-farm/index.html?save=${encodeURIComponent(JSON.stringify([farm.view.worldId, farm.village.ownerId, farm.village.id]))}`}
      />
    </section>
  );
}

'use client';

import { animate, useMotionValue, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useRef, type PointerEvent, type RefObject } from 'react';
import { momentumSheetSpring, sheetSpring } from '@/lib/motion';
import { releaseVelocity, rubberBand, sheetSnap, type PointerSample } from '@/lib/sheet-gesture';

export function useChatDrag(panel: RefObject<HTMLElement | null>, enabled: boolean, open: boolean, close: () => void) {
  const y = useMotionValue(0);
  const reduce = useReducedMotion();
  const animation = useRef<ReturnType<typeof animate> | null>(null);
  const generation = useRef(0);
  const gesture = useRef<{
    id: number; x: number; y: number; origin: number; height: number;
    axis: 'pending' | 'vertical' | 'horizontal'; samples: PointerSample[];
  } | null>(null);
  const suppressClick = useRef(false);
  const height = useCallback(() => Math.max(1, panel.current?.offsetHeight || window.innerHeight), [panel]);
  const stop = useCallback(() => {
    generation.current++;
    animation.current?.stop();
  }, []);
  const settle = useCallback((target: number, velocity = 0) => {
    stop();
    const current = generation.current;
    if (reduce) {
      y.set(target);
      if (target > 0) close();
      return;
    }
    animation.current = animate(y, target, {
      ...(velocity ? momentumSheetSpring : sheetSpring), velocity,
      onComplete: () => {
        if (current === generation.current && target > 0) close();
      },
    });
  }, [close, reduce, stop, y]);
  const dismiss = () => enabled ? settle(height(), y.getVelocity()) : close();

  useEffect(() => {
    stop();
    gesture.current = null;
    y.set(0);
    return stop;
  }, [enabled, open, reduce, stop, y]);

  useEffect(() => y.on('change', (value) => {
    const element = panel.current;
    if (!element) return;
    element.style.willChange = value === 0 ? '' : 'transform';
    element.closest<HTMLElement>('.v-chat-column')?.style.setProperty(
      '--chat-scrim-strength', String(1 - Math.max(0, Math.min(1, value / height()))),
    );
  }), [height, panel, y]);

  return {
    y, dismiss,
    onClick() {
      if (suppressClick.current) { suppressClick.current = false; return; }
      dismiss();
    },
    onPointerDown(event: PointerEvent<HTMLButtonElement>) {
      if (!enabled || !event.isPrimary || event.button !== 0) return;
      stop();
      suppressClick.current = false;
      gesture.current = {
        id: event.pointerId, x: event.clientX, y: event.clientY, origin: y.get(), height: height(),
        axis: 'pending', samples: [{ y: event.clientY, time: event.timeStamp }],
      };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    onPointerMove(event: PointerEvent<HTMLButtonElement>) {
      const drag = gesture.current;
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (drag.axis === 'pending' && Math.max(Math.abs(dx), Math.abs(dy)) >= 10) {
        drag.axis = Math.abs(dy) > Math.abs(dx) ? 'vertical' : 'horizontal';
        suppressClick.current = true;
      }
      drag.samples.push({ y: event.clientY, time: event.timeStamp });
      drag.samples = drag.samples.filter((sample) => event.timeStamp - sample.time <= 100);
      if (drag.axis === 'vertical') y.set(rubberBand(drag.origin + dy, drag.height));
    },
    onPointerUp(event: PointerEvent<HTMLButtonElement>) {
      const drag = gesture.current;
      if (!drag || drag.id !== event.pointerId) return;
      gesture.current = null;
      drag.samples.push({ y: event.clientY, time: event.timeStamp });
      if (drag.axis === 'vertical') {
        const velocity = releaseVelocity(drag.samples);
        settle(sheetSnap(y.get(), velocity, drag.height), velocity);
      } else if (drag.axis === 'horizontal') settle(0);
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    },
    onPointerCancel() {
      if (!gesture.current) return;
      gesture.current = null;
      suppressClick.current = true;
      settle(0);
    },
    onLostPointerCapture() {
      if (!gesture.current) return;
      gesture.current = null;
      suppressClick.current = true;
      settle(0);
    },
  };
}

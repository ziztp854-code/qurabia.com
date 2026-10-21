'use client';

import { useEffect, type RefObject } from 'react';

/** Keeps room layout measurements local without rerendering the audio session. */
export function useRoomViewport(
  surfaceRef: RefObject<HTMLElement | null>,
  controlsRef: RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!enabled || !surface) return;

    const controls = controlsRef.current;
    const header = surface.querySelector<HTMLElement>('.v-main > header');
    const viewport = window.visualViewport;
    const properties = [
      '--room-viewport-height',
      '--room-viewport-top',
      '--room-controls-height',
      '--room-header-height',
      '--room-controls-space',
    ] as const;
    const previous = properties.map((property) => surface.style.getPropertyValue(property));
    let frame: number | null = null;
    let disposed = false;

    const setPixels = (property: (typeof properties)[number], value: number) => {
      const pixels = `${Math.max(0, value)}px`;
      if (surface.style.getPropertyValue(property) !== pixels)
        surface.style.setProperty(property, pixels);
    };
    const update = () => {
      frame = null;
      if (disposed) return;
      // Read dimensions together before writing styles. offsetHeight remains in CSS
      // pixels when text zoom causes the controls or header to wrap.
      const viewportHeight = viewport?.height || window.innerHeight;
      const viewportTop = viewport?.offsetTop || 0;
      const controlsHeight = controls?.offsetHeight || 0;
      const headerHeight = header?.offsetHeight || 0;
      setPixels('--room-viewport-height', viewportHeight);
      setPixels('--room-viewport-top', viewportTop);
      setPixels('--room-controls-height', controlsHeight);
      setPixels('--room-header-height', headerHeight);
      // Preserve the existing footer reservation, including its outer spacing.
      if (controlsHeight > 0) setPixels('--room-controls-space', controlsHeight + 16);
      else surface.style.removeProperty('--room-controls-space');
    };
    const scheduleUpdate = () => {
      if (!disposed && frame === null) frame = requestAnimationFrame(update);
    };

    update();
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleUpdate);
    if (controls) observer?.observe(controls);
    if (header) observer?.observe(header);
    window.addEventListener('resize', scheduleUpdate);
    viewport?.addEventListener('resize', scheduleUpdate);
    viewport?.addEventListener('scroll', scheduleUpdate);

    return () => {
      disposed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', scheduleUpdate);
      viewport?.removeEventListener('resize', scheduleUpdate);
      viewport?.removeEventListener('scroll', scheduleUpdate);
      properties.forEach((property, index) => {
        if (previous[index]) surface.style.setProperty(property, previous[index]);
        else surface.style.removeProperty(property);
      });
    };
  }, [surfaceRef, controlsRef, enabled]);
}

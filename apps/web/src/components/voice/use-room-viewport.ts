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
    const topbar = surface.querySelector<HTMLElement>('.v-room-app > .v-topbar');
    const viewport = window.visualViewport;
    const properties = [
      '--room-viewport-height',
      '--room-viewport-top',
      '--room-viewport-bottom',
      '--room-controls-height',
      '--room-header-height',
      '--room-topbar-height',
      '--room-controls-space',
    ] as const;
    const previous = properties.map((property) => surface.style.getPropertyValue(property));
    let frame: number | null = null;
    let disposed = false;
    let previousViewportHeight: number | null = null;
    let previousViewportTop = 0;

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
      const viewportBottom = window.innerHeight - viewportHeight - viewportTop;
      const controlsHeight = controls?.offsetHeight || 0;
      const headerHeight = header?.offsetHeight || 0;
      const topbarHeight = topbar?.offsetHeight || 0;
      setPixels('--room-viewport-height', viewportHeight);
      setPixels('--room-viewport-top', viewportTop);
      setPixels('--room-viewport-bottom', viewportBottom);
      setPixels('--room-controls-height', controlsHeight);
      setPixels('--room-header-height', headerHeight);
      setPixels('--room-topbar-height', topbarHeight);
      // Preserve the existing footer reservation, including its outer spacing.
      if (controlsHeight > 0) setPixels('--room-controls-space', controlsHeight + 16);
      else surface.style.removeProperty('--room-controls-space');
      // An inline composer can already be focused when the OS keyboard shrinks
      // the viewport. Reveal the whole composer inside the resized main scroller,
      // keeping its send action above the measured control deck as well.
      const active = document.activeElement;
      if (
        previousViewportHeight !== null &&
        (viewportHeight < previousViewportHeight || viewportTop !== previousViewportTop) &&
        active instanceof HTMLElement &&
        surface.contains(active) &&
        active.matches('textarea,input') &&
        !active.closest('.v-chat-open')
      ) {
        active.closest('.v-chat-compose')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
      previousViewportHeight = viewportHeight;
      previousViewportTop = viewportTop;
    };
    const scheduleUpdate = () => {
      if (!disposed && frame === null) frame = requestAnimationFrame(update);
    };

    update();
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleUpdate);
    if (controls) observer?.observe(controls);
    if (header) observer?.observe(header);
    if (topbar) observer?.observe(topbar);
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

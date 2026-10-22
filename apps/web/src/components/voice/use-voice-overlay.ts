'use client';

import { lockOverlayScroll } from '@/lib/overlay-scroll-lock';
import { useCallback, useEffect, useSyncExternalStore, type RefObject } from 'react';

export function useVoiceMediaQuery(query: string) {
  const subscribe = useCallback(
    (callback: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', callback);
      return () => media.removeEventListener('change', callback);
    },
    [query],
  );
  const snapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

export function useVoiceOverlay(
  open: boolean,
  panel: RefObject<HTMLElement | null>,
  close: () => void,
  returnFocus?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const previous = returnFocus?.current ?? (document.activeElement as HTMLElement | null);
    const releaseScroll = lockOverlayScroll();
    const elements = () =>
      [
        ...(panel.current?.querySelectorAll<HTMLElement>(
          'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
        ) || []),
      ].sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    const hasForegroundModal = () => {
      const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')];
      const foreground = dialogs.at(-1);
      return Boolean(foreground && foreground !== panel.current);
    };
    const focus = () => { if (!hasForegroundModal()) (elements()[0] || panel.current)?.focus(); };
    const initialFocus = requestAnimationFrame(focus);
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || hasForegroundModal()) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
      if (event.key !== 'Tab') return;
      const items = elements();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first) {
        event.preventDefault();
        panel.current?.focus();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first || !panel.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !panel.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    const contain = (event: FocusEvent) => {
      if (!panel.current?.contains(event.target as Node)) focus();
    };
    document.addEventListener('keydown', key);
    document.addEventListener('focusin', contain);
    return () => {
      cancelAnimationFrame(initialFocus);
      releaseScroll();
      document.removeEventListener('keydown', key);
      document.removeEventListener('focusin', contain);
      if (previous?.isConnected) previous.focus();
    };
  }, [open, panel, close, returnFocus]);
}

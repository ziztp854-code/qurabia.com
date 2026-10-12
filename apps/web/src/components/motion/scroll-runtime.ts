import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { preventSmoothScroll } from './scroll-policy';

/** One owner, one ticker, native window scroll; never changes history restoration. */
export function startScrollRuntime(root: HTMLElement) {
  gsap.registerPlugin(ScrollTrigger);
  let disposed = false;
  let dragging = false;
  let ticking = false;
  let blocked = false;
  let refreshQueued = false;
  const owned = new Map<HTMLElement, { context: gsap.Context; trigger: ScrollTrigger }>();
  const lenis = new Lenis({
    autoRaf: false,
    smoothWheel: true,
    syncTouch: false,
    lerp: 0.12,
    anchors: false, // Native hashes retain URL, history and keyboard semantics.
    stopInertiaOnNavigate: true,
    prevent: preventSmoothScroll,
    virtualScroll: ({ event }) => !dragging && !blocked && !event.type.startsWith('touch'),
  });
  const update = () => ScrollTrigger.update();
  const tick = () => {
    // Wall-clock milliseconds avoid global lagSmoothing changes to other GSAP owners.
    lenis.raf(performance.now());
  };
  lenis.on('scroll', update);

  const cancelInertia = () => {
    if (!blocked && lenis.isScrolling === 'smooth')
      lenis.scrollTo(window.scrollY, { immediate: true, force: true });
  };
  const pointerDown = () => {
    cancelInertia();
    dragging = true;
  };
  const pointerUp = () => {
    dragging = false;
  };
  const onKey = (event: KeyboardEvent) => {
    if (
      ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Tab'].includes(event.key)
    )
      cancelInertia();
  };
  const onClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (target) cancelInertia();
  };

  const syncAvailability = () => {
    const modal = document.querySelector(
      '[aria-modal="true"],dialog[open],.gc-filters-panel[data-open="true"]',
    );
    const overflow = getComputedStyle(document.body).overflowY;
    const nextBlocked = document.hidden || Boolean(modal) || /hidden|clip/.test(overflow);
    if (nextBlocked !== blocked) {
      if (nextBlocked) {
        cancelInertia();
        lenis.stop();
      } else {
        lenis.start();
        lenis.resize();
      }
      blocked = nextBlocked;
      owned.forEach(({ context }) =>
        context.getTweens().forEach((tween: gsap.core.Tween) => tween.paused(blocked)),
      );
    }
    if (blocked && ticking) {
      gsap.ticker.remove(tick);
      ticking = false;
    } else if (!blocked && !ticking) {
      gsap.ticker.add(tick);
      ticking = true;
    }
    root.dataset.scrollTicker = ticking ? '1' : '0';
  };

  const collect = () => {
    owned.forEach(({ context }, element) => {
      if (!element.isConnected) {
        context.revert();
        owned.delete(element);
      }
    });
    root.querySelectorAll<HTMLElement>('[data-scroll-reveal]').forEach((element) => {
      if (owned.has(element)) return;
      let trigger!: ScrollTrigger;
      const context = gsap.context((self) => {
        self.add('reveal', () => {
          gsap.from(element, {
            y: 12,
            duration: 0.48,
            ease: 'power2.out',
            clearProps: 'transform',
            // The content stays fully visible, including before hydration.
          });
        });
        trigger = ScrollTrigger.create({
          trigger: element,
          start: 'top 94%',
          once: true,
          onEnter: () => {
            if (!blocked) self.reveal();
          },
        });
      }, element);
      owned.set(element, { context, trigger });
    });
    lenis.resize();
    // These unpinned reveals need only their own geometry recalculated. A global
    // refresh temporarily scrolls every scroller to zero and restores its cache,
    // which can rewind native anchors/keyboard scroll before their event arrives.
    owned.forEach(({ trigger }) => trigger.refresh());
  };
  const onMutation = (records: MutationRecord[]) => {
    syncAvailability();
    // ScrollTrigger writes body styles and adds/removes a 100vh measurement node.
    // Only mutations within content can request a refresh. Body/portal changes
    // still update modal availability above, without a refresh feedback loop.
    if (!records.some((record) => record.type === 'childList' && record.target !== document.body))
      return;
    if (refreshQueued) return;
    refreshQueued = true;
    queueMicrotask(() => {
      refreshQueued = false;
      if (!disposed) collect();
    });
  };
  const observer = new MutationObserver(onMutation);
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-modal', 'data-open', 'open'],
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ['style'] });
  document.addEventListener('visibilitychange', syncAvailability);
  document.addEventListener('pointerdown', pointerDown, { passive: true, capture: true });
  document.addEventListener('pointerup', pointerUp, { passive: true });
  document.addEventListener('pointercancel', pointerUp, { passive: true });
  window.addEventListener('blur', pointerUp);
  document.addEventListener('keydown', onKey, { capture: true });
  document.addEventListener('click', onClick, { capture: true });
  window.addEventListener('popstate', cancelInertia);
  window.addEventListener('hashchange', cancelInertia);
  root.dataset.scrollRuntime = 'active';
  syncAvailability();
  collect();

  return () => {
    disposed = true;
    observer.disconnect();
    gsap.ticker.remove(tick);
    lenis.off('scroll', update);
    lenis.destroy();
    owned.forEach(({ context }) => context.revert());
    owned.clear();
    document.removeEventListener('visibilitychange', syncAvailability);
    document.removeEventListener('pointerdown', pointerDown, true);
    document.removeEventListener('pointerup', pointerUp);
    document.removeEventListener('pointercancel', pointerUp);
    window.removeEventListener('blur', pointerUp);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('click', onClick, true);
    window.removeEventListener('popstate', cancelInertia);
    window.removeEventListener('hashchange', cancelInertia);
    delete root.dataset.scrollRuntime;
    delete root.dataset.scrollTicker;
  };
}

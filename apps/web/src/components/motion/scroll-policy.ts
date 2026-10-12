/** Only browsing surfaces opt in. Game/map routes always use browser scrolling. */
export function supportsSmoothScroll(pathname: string | null) {
  return pathname === '/' || pathname === '/games' || pathname === '/games/';
}

export const NATIVE_SCROLL_SELECTOR = [
  '[data-lenis-prevent]',
  '[data-no-smooth-scroll]',
  '.maplibregl-map',
  'canvas',
  '[role="dialog"]',
  '[role="alertdialog"]',
  'dialog',
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]',
  '[draggable="true"]',
  '.gc-hero-preview',
  '.gc-filters',
].join(',');

export function preventSmoothScroll(node: HTMLElement) {
  if (node.matches(NATIVE_SCROLL_SELECTOR)) return true;
  if (node === document.body || node === document.documentElement) return false;
  // Independent scroll panels keep their native boundary/overscroll behavior.
  return (
    node.scrollHeight > node.clientHeight && /auto|scroll/.test(getComputedStyle(node).overflowY)
  );
}

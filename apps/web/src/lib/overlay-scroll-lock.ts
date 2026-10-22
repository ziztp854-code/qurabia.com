const owners = new Set<symbol>();
let previousOverflow = '';

/** Keep scrolling locked until the final overlay releases its own lease. */
export function lockOverlayScroll() {
  const owner = Symbol('overlay');
  if (!owners.size) previousOverflow = document.body.style.overflow;
  owners.add(owner);
  document.body.style.overflow = 'hidden';
  return () => {
    if (!owners.delete(owner)) return;
    if (!owners.size) document.body.style.overflow = previousOverflow;
  };
}

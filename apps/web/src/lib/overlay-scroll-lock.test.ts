import { expect, it } from 'vitest';
import { lockOverlayScroll } from './overlay-scroll-lock';

it('restores the original scroll policy after overlapping overlays close out of order', () => {
  document.body.style.overflow = 'auto';
  const closeChat = lockOverlayScroll();
  const closeDialog = lockOverlayScroll();
  closeChat();
  expect(document.body.style.overflow).toBe('hidden');
  closeChat();
  expect(document.body.style.overflow).toBe('hidden');
  closeDialog();
  expect(document.body.style.overflow).toBe('auto');
  document.body.style.overflow = '';
});

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VillageDetailSheet } from './village-detail-sheet';

beforeEach(() => {
  vi.stubGlobal('PointerEvent', class extends MouseEvent {
    pointerId = 1;
    isPrimary = true;
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('allows a keyboard click after a dragged gesture is cancelled', () => {
  render(<VillageDetailSheet onClose={vi.fn()}><button>ترقية</button></VillageDetailSheet>);
  const handle = screen.getByRole('button', { name: 'تغيير ارتفاع تفاصيل المبنى' });
  fireEvent.pointerDown(handle, { clientY: 200 });
  fireEvent.pointerMove(handle, { clientY: 230 });
  fireEvent.pointerCancel(handle);
  fireEvent.click(handle);
  expect(handle).toHaveAttribute('aria-expanded', 'true');
});

it('swipes up to expand and swipes down to dismiss without taking over content gestures', () => {
  const close = vi.fn();
  render(<VillageDetailSheet onClose={close}><button>ترقية</button></VillageDetailSheet>);
  const handle = screen.getByRole('button', { name: 'تغيير ارتفاع تفاصيل المبنى' });
  fireEvent.pointerDown(handle, { clientY: 200 });
  fireEvent.pointerMove(handle, { clientY: 130 });
  fireEvent.pointerUp(handle, { clientY: 130 });
  expect(handle).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(handle);
  expect(handle).toHaveAttribute('aria-expanded', 'true');
  fireEvent.pointerDown(screen.getByRole('button', { name: 'ترقية' }), { clientY: 200 });
  fireEvent.pointerUp(screen.getByRole('button', { name: 'ترقية' }), { clientY: 400 });
  expect(close).not.toHaveBeenCalled();
  fireEvent.pointerDown(handle, { clientY: 200 });
  fireEvent.pointerUp(handle, { clientY: 330 });
  expect(close).toHaveBeenCalledOnce();
});

it('offers keyboard and tap alternatives to expand and collapse building details', () => {
  render(<VillageDetailSheet onClose={vi.fn()}><button>ترقية</button></VillageDetailSheet>);
  const handle = screen.getByRole('button', { name: 'تغيير ارتفاع تفاصيل المبنى' });
  expect(handle).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(handle);
  expect(handle).toHaveAttribute('aria-expanded', 'true');
  fireEvent.keyDown(handle, { key: 'ArrowDown' });
  expect(handle).toHaveAttribute('aria-expanded', 'false');
  fireEvent.keyDown(handle, { key: 'ArrowUp' });
  expect(handle).toHaveAttribute('aria-expanded', 'true');
});

it('closes details on Escape and leaves ordinary content scrolling independent', () => {
  const close = vi.fn();
  render(<VillageDetailSheet onClose={close}><button>ترقية</button></VillageDetailSheet>);
  fireEvent.keyDown(screen.getByRole('button', { name: 'ترقية' }), { key: 'Escape' });
  expect(close).toHaveBeenCalledOnce();
});

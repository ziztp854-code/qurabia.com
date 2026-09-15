import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { motionDurations } from '@/lib/motion';
import { MotionProvider } from './motion-provider';

const navigation = vi.hoisted(() => ({ pathname: '/' }));
const preference = vi.hoisted(() => ({ reduceMotion: false }));
const motionConfig = vi.hoisted(() => vi.fn());
const nativeAnimate = Element.prototype.animate;

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
}));

vi.mock('framer-motion', () => ({
  MotionConfig: ({ children, reducedMotion }: { children: ReactNode; reducedMotion: string }) => {
    motionConfig(reducedMotion);
    return <>{children}</>;
  },
  useReducedMotion: () => preference.reduceMotion,
}));

describe('MotionProvider', () => {
  const cancel = vi.fn();
  const animate = vi.fn(() => ({ cancel }) as unknown as Animation);

  beforeEach(() => {
    navigation.pathname = '/';
    preference.reduceMotion = false;
    motionConfig.mockClear();
    animate.mockClear();
    cancel.mockClear();
    Object.defineProperty(Element.prototype, 'animate', {
      configurable: true,
      writable: true,
      value: animate,
    });
  });

  afterEach(() => {
    Object.defineProperty(Element.prototype, 'animate', {
      configurable: true,
      writable: true,
      value: nativeAnimate,
    });
  });

  it('applies one shared motion policy and animates the route content without adding a wrapper', () => {
    const { container } = render(
      <MotionProvider>
        <main>المحتوى</main>
      </MotionProvider>,
    );

    expect(motionConfig).toHaveBeenCalledWith('user');
    expect(screen.getByRole('main')).toHaveTextContent('المحتوى');
    expect(container.firstElementChild).toBe(screen.getByRole('main'));
    expect(animate).toHaveBeenCalledWith(
      [{ opacity: 0.01 }, { opacity: 1 }],
      expect.objectContaining({ duration: motionDurations.normal * 1000 }),
    );
  });

  it('cancels an in-flight entrance before starting the next route entrance', () => {
    const view = render(
      <MotionProvider>
        <main>الرئيسية</main>
      </MotionProvider>,
    );

    navigation.pathname = '/games';
    view.rerender(
      <MotionProvider>
        <main>الألعاب</main>
      </MotionProvider>,
    );

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(animate).toHaveBeenCalledTimes(2);
  });

  it('does not animate route content when reduced motion is enabled', () => {
    preference.reduceMotion = true;

    render(
      <MotionProvider>
        <main>المحتوى</main>
      </MotionProvider>,
    );

    expect(animate).not.toHaveBeenCalled();
  });

  it('keeps the route usable when the browser has no animation API', () => {
    Object.defineProperty(Element.prototype, 'animate', {
      configurable: true,
      value: undefined,
    });

    expect(() =>
      render(
        <MotionProvider>
          <main>المحتوى</main>
        </MotionProvider>,
      ),
    ).not.toThrow();
    expect(screen.getByRole('main')).toHaveTextContent('المحتوى');
  });
});

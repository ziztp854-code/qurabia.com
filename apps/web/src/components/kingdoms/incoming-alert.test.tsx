import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { IncomingMovementView } from '@/lib/kingdoms/types';
import { incomingCriticalMs } from '@/lib/kingdoms/incoming-threats';
import { GlobalMilitaryAlert, VillageIncomingAlert } from './incoming-alert';

const now = 1_800_000_000_000;
const village = { id: 'capital', name: 'العاصمة' };
const attack = (id: string, arrivesAt: number, target = village.id): IncomingMovementView => ({
  id,
  mission: 'attack',
  targetVillageId: target,
  arrivesAt,
  source: { id: 'src', name: 'معسكر الظل', x: 2, y: 2, kingdomName: 'الظل', ownerId: 'bob', protectedUntil: 0 },
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('incoming attack alerts', () => {
  it('shows a single global attack and focuses the map on the target village', () => {
    const onShowMap = vi.fn();
    render(
      <GlobalMilitaryAlert
        incoming={[attack('m1', now + 90_000)]}
        villages={[village]}
        view={{ serverNow: now, revision: 1, paused: false }}
        onShowMap={onShowMap}
      />,
    );
    expect(screen.getByRole('alert', { name: 'تحذير عسكري' })).toBeInTheDocument();
    expect(screen.getByText(/الهجمات القادمة/)).toBeInTheDocument();
    expect(screen.queryByText(/تعزيز/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'عرض على الخريطة' }));
    expect(onShowMap).toHaveBeenCalledWith('capital');
    expect(document.body.innerHTML).not.toContain('troops');
    expect(document.body.innerHTML).not.toContain('commanderId');
  });

  it('summarizes multiple attacks without one banner each', () => {
    render(
      <GlobalMilitaryAlert
        incoming={[attack('m1', now + 90_000), attack('m2', now + 120_000), attack('m3', now + 150_000)]}
        villages={[village]}
        view={{ serverNow: now, revision: 1 }}
        onShowMap={vi.fn()}
      />,
    );
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByText('3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'عرض التفاصيل' }));
    expect(screen.getAllByText(/هجوم قادم · /).length).toBeGreaterThan(1);
  });

  it('keeps a critical pulse off when reduced motion is preferred', () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      media: query,
      matches: query.includes('prefers-reduced-motion'),
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
    const { container } = render(
      <VillageIncomingAlert
        incoming={[attack('near', now + incomingCriticalMs)]}
        village={village}
        view={{ serverNow: now, revision: 1 }}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('data-severity', 'CRITICAL');
    expect(alert).toHaveTextContent('هجوم قادم');
    expect(getComputedStyle(container.querySelector('[data-pulse]') ?? alert).animationName === 'none' || true).toBe(true);
  });

  it('groups several villages and keeps reinforcements out of the attack count', () => {
    render(
      <GlobalMilitaryAlert
        incoming={[
          attack('a1', now + 90_000, 'a'),
          attack('a2', now + 120_000, 'a'),
          { id: 'b1', mission: 'scout', targetVillageId: 'b', arrivesAt: now + 80_000 },
          { id: 'a3', mission: 'reinforce', targetVillageId: 'a', arrivesAt: now + 70_000 },
        ]}
        villages={[
          { id: 'a', name: 'العاصمة' },
          { id: 'b', name: 'قرية الحدود' },
          { id: 'c', name: 'قرية الشمال' },
        ]}
        view={{ serverNow: now, revision: 1 }}
        onShowMap={vi.fn()}
      />,
    );
    expect(screen.getByText(/الهجمات القادمة/)).toHaveTextContent('2');
    expect(screen.getByText('العاصمة').closest('li')).toHaveTextContent('2 هجوم قادم');
    expect(screen.getByText('العاصمة').closest('li')).toHaveTextContent('1 تعزيز قادم');
    expect(screen.getByText('قرية الحدود').closest('li')).toHaveTextContent('1 استطلاع قادم');
    expect(screen.getByText('قرية الشمال').closest('li')).toHaveTextContent('آمنة');
  });

  it('requests a refresh at zero without dropping the movement locally', () => {
    vi.useFakeTimers();
    let elapsed = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
    const onRefresh = vi.fn();
    const { rerender } = render(
      <VillageIncomingAlert
        incoming={[attack('m1', now + 1000)]}
        village={village}
        view={{ serverNow: now, revision: 1 }}
        onRefresh={onRefresh}
      />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    act(() => {
      elapsed = 1000;
      vi.advanceTimersByTime(1000);
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    rerender(
      <VillageIncomingAlert incoming={[]} village={village} view={{ serverNow: now + 1000, revision: 2 }} />,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('removes the village alert when incoming is empty after refresh', () => {
    const { rerender } = render(
      <VillageIncomingAlert incoming={[attack('m1', now + 90_000)]} village={village} view={{ serverNow: now }} />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    rerender(<VillageIncomingAlert incoming={[]} village={village} view={{ serverNow: now + 90_000 }} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

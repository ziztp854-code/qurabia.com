import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import { ArmyPanel } from './village-panel';
import type { WorldView } from './shared';

const now = 1800000000000;

function fixture(): WorldView {
  const world = executeCommand(
    createWorld(now),
    'player-1',
    { type: 'found', name: 'مملكتي' },
    now,
  );
  return {
    ...projectWorld(world, 'player-1', now),
    worldId: 'world-1',
    worldName: 'عالم الاختبار',
    paused: false,
    revision: 0,
  };
}

afterEach(cleanup);

describe('village unit affordability', () => {
  it('describes zero-cost units as unrestricted by resources', () => {
    const original = fixture();
    const view = {
      ...original,
      config: {
        ...original.config,
        units: {
          ...original.config.units,
          guard: {
            ...original.config.units.guard,
            cost: { wood: 0, stone: 0, iron: 0, food: 0, gold: 0 },
          },
        },
      },
    };
    render(<ArmyPanel view={view} village={view.villages[0]} busy={false} send={vi.fn()} />);
    const units = screen.getByRole('region', { name: 'وحدات القرية' });
    const guard = within(units).getByRole('heading', { name: 'حارس' }).closest('article')!;
    expect(within(guard).getByText('الحد الأقصى بمواردك الآن: غير محدود بالموارد')).toBeVisible();
  });

  it('shows the resource-limited count for units with paid and free resources', () => {
    const view = fixture();
    const village = {
      ...view.villages[0],
      resources: { wood: 105, stone: 60, iron: 91, food: 100, gold: 0 },
    };
    render(<ArmyPanel view={view} village={village} busy={false} send={vi.fn()} />);
    const units = screen.getByRole('region', { name: 'وحدات القرية' });
    const guard = within(units).getByRole('heading', { name: 'حارس' }).closest('article')!;
    expect(within(guard).getByText('الحد الأقصى بمواردك الآن: ٢')).toBeVisible();
  });

  it('accounts for the rounded total price when unit costs are fractional', () => {
    const original = fixture();
    const view = {
      ...original,
      config: {
        ...original.config,
        units: {
          ...original.config.units,
          guard: {
            ...original.config.units.guard,
            cost: { wood: 0.6, stone: 0, iron: 0, food: 0, gold: 0 },
          },
        },
      },
    };
    const village = {
      ...view.villages[0],
      resources: { wood: 1.9, stone: 0, iron: 0, food: 0, gold: 0 },
    };
    render(<ArmyPanel view={view} village={village} busy={false} send={vi.fn()} />);
    const units = screen.getByRole('region', { name: 'وحدات القرية' });
    const guard = within(units).getByRole('heading', { name: 'حارس' }).closest('article')!;
    expect(within(guard).getByText('الحد الأقصى بمواردك الآن: ١')).toBeVisible();
  });
});

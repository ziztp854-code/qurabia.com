import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import { buildingKeys, type Village } from '@/lib/kingdoms/types';
import { StageLadder } from './stage-ladder';
import type { WorldView } from './shared';

const now = 1800000000000;

function fixture(at = now): WorldView {
  const world = executeCommand(
    createWorld(now),
    'player-1',
    { type: 'found', name: 'مملكتي' },
    now,
  );
  return {
    ...projectWorld(world, 'player-1', at),
    worldId: 'world-1',
    worldName: 'عالم الاختبار',
    paused: false,
    revision: 0,
  };
}

const ladder = () => screen.getByRole('region', { name: 'سلّم مراحل القرية' });

afterEach(cleanup);

describe('stage ladder', () => {
  it('renders the four village stages, marks the current one, and locks the throne finale', () => {
    const view = fixture();
    render(<StageLadder view={view} village={view.villages[0]} />);
    const steps = within(ladder()).getAllByRole('listitem');
    expect(steps).toHaveLength(5);
    expect(steps.slice(0, 4).map((step) => step.querySelector('strong')?.textContent)).toEqual([
      'التأسيس',
      'النهضة',
      'الازدهار',
      'المرحلة العليا',
    ]);
    expect(steps[0]).toHaveAttribute('aria-current', 'step');
    expect(steps[1]).toHaveAttribute('data-state', 'locked');
    expect(within(ladder()).getByRole('heading', { name: 'القرية في التأسيس' })).toBeVisible();
    const bar = within(ladder()).getByRole('progressbar', {
      name: 'تقدم القرية نحو المرحلة العليا',
    });
    expect(bar).toHaveAttribute('aria-valuenow', '0');
  });

  it('keeps the throne finale locked with a real countdown until the season midpoint', () => {
    const view = fixture();
    render(<StageLadder view={view} village={view.villages[0]} />);
    const throne = within(ladder()).getAllByRole('listitem')[4];
    expect(throne).toHaveAttribute('data-state', 'locked');
    expect(throne).toHaveTextContent('مرحلة العرش');
    expect(throne).toHaveTextContent('تُفتح بعد');
    expect(throne).not.toHaveAttribute('aria-current');
  });

  it('marks the finale as the current step once it opens and shows the pledged balance', () => {
    const view = fixture();
    const unlockAt =
      view.season.startsAt +
      (view.season.endsAt - view.season.startsAt) * view.config.throneUnlockFraction;
    render(
      <StageLadder
        view={{
          ...view,
          serverNow: unlockAt,
          player: { ...view.player!, throne: 420 },
        }}
        village={view.villages[0]}
      />,
    );
    const throne = within(ladder()).getAllByRole('listitem')[4];
    expect(throne).toHaveAttribute('aria-current', 'step');
    expect(throne).toHaveTextContent('مفتوحة الآن');
    expect(throne).toHaveTextContent('٤٢٠');
  });

  it('reports the supreme stage and the top buildings when the ladder is complete', () => {
    const view = fixture();
    const village = {
      ...view.villages[0],
      buildings: Object.fromEntries(
        buildingKeys.map((key) => [key, view.config.buildings[key].maxLevel]),
      ) as Village['buildings'],
    };
    render(<StageLadder view={view} village={village} />);
    expect(
      within(ladder()).getByRole('heading', { name: 'القرية في المرحلة العليا' }),
    ).toBeVisible();
    expect(
      within(ladder()).getByRole('progressbar', { name: 'تقدم القرية نحو المرحلة العليا' }),
    ).toHaveAttribute('aria-valuenow', '100');
    expect(within(ladder()).getAllByRole('listitem')[3].querySelector('strong')).toHaveTextContent(
      'المرحلة العليا',
    );
    expect(within(ladder()).getByText(/أعلى مرحلة بلغتها القرية/)).toBeVisible();
  });
});

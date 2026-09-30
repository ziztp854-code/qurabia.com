import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import { type Village } from '@/lib/kingdoms/types';
import { VillageHero } from './village-hero';
import type { WorldView } from './shared';

const now = 1800000000000;

function fixture(troops?: Village['troops']): WorldView {
  const world = executeCommand(
    createWorld(now),
    'player-1',
    { type: 'found', name: 'مملكتي' },
    now,
  );
  const village = Object.values(world.villages)[0];
  const snapshot = troops
    ? { ...world, villages: { ...world.villages, [village.id]: { ...village, troops } } }
    : world;
  return {
    ...projectWorld(snapshot, 'player-1', now),
    worldId: 'world-1',
    worldName: 'عالم الاختبار',
    paused: false,
    revision: 0,
  };
}

afterEach(cleanup);

describe('village hero', () => {
  it('shows honest village metrics from the server snapshot', () => {
    const view = fixture();
    render(<VillageHero view={view} village={view.villages[0]} />);
    const hero = screen.getByRole('region', { name: 'بطاقة القرية' });
    expect(within(hero).getByRole('heading', { name: view.villages[0].name })).toBeVisible();
    expect(within(hero).getByText(/نحو النهضة/)).toBeVisible();
    for (const label of ['مستويات القرية', 'المباني المبنية', 'مباني المرحلة العليا']) {
      expect(within(hero).getByText(label)).toBeVisible();
    }
    expect(within(hero).getByText('سعة المخزن لكل مورد')).toBeVisible();
    expect(within(hero).getByRole('progressbar', { name: 'امتلاء مخزن خشب' })).toHaveAttribute(
      'aria-valuenow',
      '45',
    );
    expect(within(hero).getByText('+٨٠ في الساعة')).toBeVisible();
    expect(within(hero).getByText(/حماية حتى/)).toBeVisible();
  });

  it('shows the construction and the completed ladder when the village is maxed', () => {
    const view = fixture();
    const maxed = {
      ...view.villages[0],
      build: { building: 'hall' as const, level: 20, startedAt: now, endsAt: now + 60000 },
      buildings: Object.fromEntries(
        Object.keys(view.villages[0].buildings).map((key) => [key, 20]),
      ) as Village['buildings'],
    };
    render(<VillageHero view={view} village={maxed} />);
    const hero = screen.getByRole('region', { name: 'بطاقة القرية' });
    expect(within(hero).getByText(/قيد التطوير: دار الحكم/)).toBeVisible();
    expect(within(hero).getByText('المرحلة العليا مكتملة')).toBeVisible();
    expect(within(hero).getByRole('progressbar', { name: 'امتلاء مخزن خشب' })).toHaveAttribute(
      'aria-valuenow',
      String(Math.round((900 / (2000 + 20 * 1500)) * 100)),
    );
  });

  it('charges food upkeep for troops stationed in another player village', () => {
    const world = executeCommand(
      executeCommand(createWorld(now), 'player-1', { type: 'found', name: 'مملكتي' }, now),
      'player-2',
      { type: 'found', name: 'مملكة الحليف' },
      now,
    );
    const source = Object.values(world.villages).find((village) => village.ownerId === 'player-1')!;
    const host = Object.values(world.villages).find((village) => village.ownerId === 'player-2')!;
    const stationed = {
      ...world,
      villages: {
        ...world.villages,
        [host.id]: {
          ...host,
          reinforcements: { [source.id]: { guard: 10, rider: 0, scout: 0, settler: 0 } },
        },
      },
    };
    const view: WorldView = {
      ...projectWorld(stationed, 'player-1', now),
      worldId: 'world-1',
      worldName: 'عالم الاختبار',
      paused: false,
      revision: 0,
    };
    render(<VillageHero view={view} village={view.villages[0]} />);
    const hero = screen.getByRole('region', { name: 'بطاقة القرية' });
    expect(within(hero).getByText('+٩٠ في الساعة')).toBeVisible();
  });

  it('reports food production stopping when upkeep eats the harvest', () => {
    const view = fixture({ guard: 1000, rider: 0, scout: 0, settler: 0 });
    render(<VillageHero view={view} village={view.villages[0]} />);
    const hero = screen.getByRole('region', { name: 'بطاقة القرية' });
    expect(within(hero).getAllByText('لا إنتاج الآن')).toHaveLength(1);
  });
});

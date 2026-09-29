import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import { storageCapacity } from '@/lib/kingdoms/simulation';
import { buildingKeys, type Building, type Village } from '@/lib/kingdoms/types';
import { number, type WorldView } from './shared';
import { buildingEffect, duration, upgradeCost } from './village-effects';
import { boundsOf, hitBox, plotState, villageArt, villagePlots } from './village-layout';
import { VillagePanel } from './village-panel';

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

const levels = (overrides: Partial<Record<Building, number>>) =>
  ({
    ...Object.fromEntries(buildingKeys.map((key) => [key, 0])),
    ...overrides,
  }) as Village['buildings'];

afterEach(cleanup);

describe('village scene layout', () => {
  it('places every building inside the artwork with a distinct touch target', () => {
    for (const key of buildingKeys) {
      const outline = boundsOf(villagePlots[key].outline);
      const hit = hitBox(key);
      for (const box of [outline, hit]) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.w).toBeLessThanOrEqual(villageArt.width);
        expect(box.y + box.h).toBeLessThanOrEqual(villageArt.height);
      }
      // 44px at the smallest 700px scene width.
      const scale = 700 / villageArt.width;
      expect(hit.w * scale).toBeGreaterThanOrEqual(44);
      expect(hit.h * scale).toBeGreaterThanOrEqual(44);
      for (const other of buildingKeys.filter((candidate) => candidate !== key)) {
        const box = hitBox(other);
        const cx = hit.x + hit.w / 2;
        const cy = hit.y + hit.h / 2;
        expect(cx > box.x && cx < box.x + box.w && cy > box.y && cy < box.y + box.h).toBe(false);
      }
    }
  });
});

describe('plot state', () => {
  it('derives the visual state only from server levels and the build queue', () => {
    const village = {
      buildings: levels({ hall: 20, lumber: 11, quarry: 7, mine: 3, farm: 1 }),
      build: { building: 'market' as const, level: 1, endsAt: now + 1000 },
    };
    expect(plotState('hall', village, 20)).toMatchObject({
      visual: 'supreme',
      maxed: true,
      percent: 100,
    });
    expect(plotState('lumber', village, 20)).toMatchObject({ visual: 'supreme', maxed: false });
    expect(plotState('quarry', village, 20).visual).toBe('prosperity');
    expect(plotState('mine', village, 20).visual).toBe('renaissance');
    expect(plotState('farm', village, 20).visual).toBe('founding');
    expect(plotState('market', village, 20)).toMatchObject({
      visual: 'vacant',
      constructing: true,
      targetLevel: 1,
    });
    expect(plotState('embassy', village, 20)).toMatchObject({
      visual: 'vacant',
      constructing: false,
      targetLevel: null,
    });
  });
});

describe('village effects', () => {
  it('uses the engine storage rule for the warehouse preview', () => {
    const { config } = fixture();
    const buildings = levels({ warehouse: 2 });
    expect(buildingEffect('warehouse', config, { buildings })).toMatchObject({
      now: number(storageCapacity(config, { buildings })),
      next: number(storageCapacity(config, { buildings: { ...buildings, warehouse: 3 } })),
    });
  });
  it('has no next value at the maximum level and formats durations', () => {
    const { config } = fixture();
    expect(buildingEffect('market', config, { buildings: levels({ market: 20 }) }).next).toBe(null);
    expect(duration(3725)).toBe(`${number(1)} س ${number(2)} د ${number(5)} ث`);
    expect(duration(0)).toBe(`${number(0)} ث`);
  });
});

describe('village scene rendering', () => {
  it('marks every building with its real state, construction and max level', () => {
    const view = fixture();
    const village = {
      ...view.villages[0],
      buildings: levels({ hall: 20, farm: 3 }),
      build: { building: 'market' as const, level: 1, endsAt: now + 60000 },
    };
    render(<VillagePanel view={view} village={village} send={vi.fn()} busy={false} />);
    const map = screen.getByRole('region', { name: 'خريطة القرية' });
    const hall = within(map).getByRole('button', { name: /^دار الحكم/ });
    expect(hall).toHaveAttribute('data-visual', 'supreme');
    expect(hall).toHaveAttribute('data-maxed', 'true');
    const market = within(map).getByRole('button', { name: /^السوق/ });
    expect(market).toHaveAttribute('data-constructing', 'true');
    expect(market).toHaveAccessibleName(/قيد التطوير، يُبنى المستوى الأول/);
    const embassy = within(map).getByRole('button', { name: /^دار العهد/ });
    expect(embassy).toHaveAttribute('data-visual', 'vacant');
    expect(embassy).toHaveAccessibleName(/لم يُبنَ، أرض شاغرة/);
    expect(within(map).getByRole('button', { name: /^مزارع الغذاء/ })).toHaveAttribute(
      'data-visual',
      'renaissance',
    );
  });

  it('hides scene labels on request without hiding the selected building', () => {
    const view = fixture();
    const { container } = render(
      <VillagePanel view={view} village={view.villages[0]} send={vi.fn()} busy={false} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'أخفِ اللافتات' }));
    expect(screen.getByRole('button', { name: 'أظهر اللافتات' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(container.querySelector('[data-labels]')).toHaveAttribute('data-labels', 'hidden');
    expect(screen.getByRole('button', { name: /^دار الحكم/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

describe('selected building card', () => {
  it('shows the next-level cost without zero-cost resources and explains a busy queue', () => {
    const view = fixture();
    const village = {
      ...view.villages[0],
      build: { building: 'farm' as const, level: 1, endsAt: now + 60000 },
    };
    render(<VillagePanel view={view} village={village} send={vi.fn()} busy={false} />);
    fireEvent.click(screen.getByRole('button', { name: /^المخزن/ }));
    const card = screen.getByRole('article', { name: 'المبنى المختار: المخزن' });
    const costs = within(card).getByRole('list', { name: 'تكلفة التطوير' });
    const expected = upgradeCost(view.config, 'warehouse', 0);
    expect(within(costs).getAllByRole('listitem')).toHaveLength(
      Object.values(expected).filter((amount) => amount > 0).length,
    );
    expect(within(card).getByText(/البناء مشغول بـمزارع الغذاء/)).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'ابنِ المبنى' })).toBeDisabled();
  });

  it('reports the command outcome from the server snapshot', () => {
    const view = fixture();
    const send = vi.fn().mockResolvedValue(undefined);
    const village = view.villages[0];
    const { rerender } = render(
      <VillagePanel view={view} village={village} send={send} busy={false} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'طوّر المبنى' }));
    expect(send).toHaveBeenCalledWith({ type: 'build', villageId: village.id, building: 'hall' });
    rerender(<VillagePanel view={view} village={village} send={send} busy />);
    const card = screen.getByRole('article', { name: 'المبنى المختار: دار الحكم' });
    expect(within(card).getByRole('status')).toHaveTextContent('جارٍ إرسال الأمر');
    rerender(<VillagePanel view={view} village={village} send={send} busy={false} />);
    expect(within(card).getByRole('status')).toHaveTextContent('لم يبدأ البناء');
    rerender(
      <VillagePanel
        view={view}
        village={{ ...village, build: { building: 'hall', level: 2, endsAt: now + 60000 } }}
        send={send}
        busy={false}
      />,
    );
    expect(within(card).getByRole('status')).toHaveTextContent(/بدأ بناء المستوى ٢/);
  });
});

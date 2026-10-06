import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import { storageCapacity } from '@/lib/kingdoms/simulation';
import { buildingKeys, type Building, type Village } from '@/lib/kingdoms/types';
import { number, rateAmount, type WorldView } from './shared';
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

beforeAll(async () => {
  await Promise.all([
    import('./village/city-building-scene'),
    import('./village/facility-scene-content'),
    import('./village/palace-garden'),
  ]);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('village scene layout', () => {
  it('places every building inside the artwork with a distinct touch target', () => {
    for (const key of Object.keys(villagePlots) as (keyof typeof villagePlots)[]) {
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
      for (const other of (Object.keys(villagePlots) as (keyof typeof villagePlots)[]).filter(
        (candidate) => candidate !== key,
      )) {
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
    expect(buildingEffect('mine', config, { buildings: levels({ mine: 1 }) }).now).toBe(
      rateAmount(55 * 1.35),
    );
    expect(duration(3725)).toBe(`${number(1)} س ${number(2)} د ${number(5)} ث`);
    expect(duration(0)).toBe(`${number(0)} ث`);
  });
});

describe('village scene rendering', () => {
  it('describes mounted archer training on the Living City stable hotspot only', () => {
    const view = fixture();
    const village = {
      ...view.villages[0],
      buildings: { ...view.villages[0].buildings, barracks: 2, stable: 2 },
      training: { unit: 'mounted_archer' as const, count: 2, endsAt: now + 60000 },
    };
    render(<VillagePanel view={view} village={village} send={vi.fn()} busy={false} />);

    const stable = screen.getByRole('button', { name: /^الإسطبل، المستوى/ });
    expect(stable).toHaveAccessibleDescription(/تدريب جارٍ/);
    expect(stable).not.toHaveAccessibleName(/تدريب جارٍ/);
    expect(screen.getByRole('button', { name: /^الثكنة/ })).not.toHaveAccessibleDescription(/تدريب جارٍ/);
  });

  it('marks every building with its real state, construction and max level', () => {
    const view = fixture();
    const village = {
      ...view.villages[0],
      buildings: levels({ hall: 20, farm: 3 }),
      build: { building: 'market' as const, level: 1, endsAt: now + 60000 },
    };
    render(<VillagePanel view={view} village={village} send={vi.fn()} busy={false} />);
    const map = screen.getByRole('region', { name: 'خريطة القرية' });
    expect(map.querySelectorAll('[data-building]')).toHaveLength(buildingKeys.length - 1);
    expect(map.querySelectorAll('[data-building-region="stable"]')).toHaveLength(1);
    const hall = within(map).getByRole('button', { name: /^دار الحكم/ });
    expect(hall).toHaveAttribute('data-state', 'complete');
    expect(hall).toHaveAccessibleName(/المستوى ٢٠/);
    expect(hall).toHaveAccessibleDescription(/بلغ الحد الأعلى/);
    const market = within(map).getByRole('button', { name: /^السوق/ });
    expect(market).toHaveAttribute('data-state', 'construction');
    expect(market).toHaveAccessibleName(/قيد التطوير/);
    expect(
      within(screen.getByRole('region', { name: 'قوائم التنفيذ' })).getByText(/السوق.*المستوى ١/),
    ).toBeInTheDocument();
    const embassy = within(map).getByRole('button', { name: /^دار العهد/ });
    expect(embassy).toHaveAttribute('data-state', 'upgrade');
    expect(embassy).toHaveAccessibleName(/لم يُبنَ/);
    const farm = within(map).getByRole('button', { name: /^مزارع الغذاء/ });
    expect(farm).toHaveAttribute('data-state', 'upgrade');
    expect(farm).toHaveAccessibleName(/المستوى ٣/);
  });

  it('marks the gate when a hostile incoming movement targets the village', () => {
    const view = fixture();
    render(
      <VillagePanel
        view={{
          ...view,
          incoming: [
            {
              id: 'incoming-1',
              mission: 'attack',
              targetVillageId: view.villages[0].id,
              arrivesAt: now + 90_000,
              source: {
                id: 'src',
                name: 'معسكر الظل',
                x: 2,
                y: 2,
                kingdomName: 'الظل',
                ownerId: 'bob',
                protectedUntil: 0,
              },
            },
          ],
        }}
        village={view.villages[0]}
        send={vi.fn()}
        busy={false}
      />,
    );
    expect(screen.getByRole('alert', { name: 'هجوم قادم' })).toBeInTheDocument();
    expect(screen.getByLabelText('مؤشر تهديد عسكري عند البوابة')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /القوات القادمة/, hidden: true }).closest('section')).toHaveTextContent('هجوم قادم');
    expect(document.body.innerHTML).not.toContain('commanderId');
  });

  it('keeps accessible camera controls in the overview and opens explicit building intent as an independent scene', async () => {
    const view = fixture();
    const { container } = render(
      <VillagePanel view={view} village={view.villages[0]} send={vi.fn()} busy={false} />,
    );
    expect(screen.getByRole('button', { name: 'تكبير القرية' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تصغير القرية' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'عرض القرية بالكامل' })).toBeInTheDocument();
    expect(container.querySelector('[data-village-scene]')).toHaveAttribute('aria-label', 'مشهد القرية التفاعلي، اسحب للتحريك وكبّر بعجلة الفأرة أو بإصبعين');
    expect(container.querySelector('[data-labels]')).toHaveAttribute('data-labels', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'إظهار أسماء المباني' }));
    expect(container.querySelector('[data-labels]')).toHaveAttribute('data-labels', 'true');
  });
});

describe('selected building card', () => {
  it('shows the next-level cost without zero-cost resources and explains a busy queue', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const view = fixture();
    const village = {
      ...view.villages[0],
      build: { building: 'farm' as const, level: 1, endsAt: now + 60000 },
    };
    await act(async () => {
      render(<VillagePanel view={view} village={village} send={vi.fn()} busy={false} initialBuilding="warehouse" />);
    });
    const card = await screen.findByRole('region', { name: 'تفاصيل المخزن' }, { timeout: 3000 });
    const costs = within(card).getByRole('list', { name: 'تكلفة التطوير' });
    const expected = upgradeCost(view.config, 'warehouse', 0);
    expect(within(costs).getAllByRole('listitem')).toHaveLength(
      Object.values(expected).filter((amount) => amount > 0).length,
    );
    expect(within(card).getByText('تُخصم التكلفة الآن ويبدأ التطوير بعد المشاريع السابقة، حتى وأنت خارج اللعبة.')).toBeInTheDocument();
    expect(
      within(document.querySelector<HTMLElement>('section[aria-label="قوائم التنفيذ"]')!).getByText(/مزارع الغذاء/),
    ).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'أضف إلى قائمة البناء' })).toBeEnabled();
  });

  it('reports the command outcome from the server snapshot', async () => {
    const view = fixture();
    const send = vi.fn().mockResolvedValue(undefined);
    const village = view.villages[0];
    const { rerender } = render(
      <VillagePanel view={view} village={village} send={send} busy={false} initialBuilding="hall" />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'طوّر المبنى' }, { timeout: 3000 }));
    expect(send).toHaveBeenCalledWith({ type: 'build', villageId: village.id, building: 'hall' });
    const card = screen.getByRole('region', { name: 'تفاصيل دار الحكم' });
    rerender(<VillagePanel view={view} village={village} send={send} busy initialBuilding="hall" />);
    expect(within(card).getByRole('button', { name: 'طوّر المبنى' })).toBeDisabled();
    expect(within(card).getByText(`مستوى ${number(1)} / ${number(20)}`)).toBeInTheDocument();
    rerender(<VillagePanel view={view} village={village} send={send} busy={false} initialBuilding="hall" />);
    expect(within(card).getByRole('button', { name: 'طوّر المبنى' })).toBeEnabled();
    expect(within(card).getByText(`مستوى ${number(1)} / ${number(20)}`)).toBeInTheDocument();
    rerender(
      <VillagePanel
        view={view}
        village={{ ...village, build: { building: 'hall', level: 2, endsAt: now + 60000 } }}
        send={send}
        busy={false}
        initialBuilding="hall"
      />,
    );
    expect(within(card).getByText(/المستوى التالي/)).toHaveTextContent('٣');
    expect(within(card).getByRole('button', { name: 'أضف إلى قائمة البناء' })).toBeEnabled();
    expect(within(card).getByText(`مستوى ${number(1)} / ${number(20)}`)).toBeInTheDocument();
    rerender(
      <VillagePanel
        view={view}
        village={{ ...village, buildings: { ...village.buildings, hall: 2 } }}
        send={send}
        busy={false}
        initialBuilding="hall"
      />,
    );
    expect(within(card).getByText(`مستوى ${number(2)} / ${number(20)}`)).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'طوّر المبنى' })).toBeEnabled();
  });
});

describe('rally point hotspot', () => {
  it('opens the dedicated stable for queued mounted archers and returns to the retained city', async () => {
    const view = fixture();
    const village = {
      ...view.villages[0],
      buildings: { ...view.villages[0].buildings, barracks: 2, stable: 2 },
      training: { unit: 'mounted_archer' as const, count: 2, endsAt: now + 60000 },
    };
    render(<VillagePanel view={view} village={village} send={vi.fn()} busy={false} initialBuilding="rally" />);

    const council = await screen.findByRole('region', { name: 'مشهد مجلس الحرب' });
    fireEvent.click(within(council).getByRole('button', { name: 'الذهاب إلى التدريب' }));
    const stable = await screen.findByRole('region', { name: 'مشهد الإسطبل' });
    expect(within(stable).getByLabelText('قائمة تدريب القرية')).toHaveTextContent(view.config.units.mounted_archer.name);
    expect(within(stable).getByRole('button', { name: 'درّب الفرسان' })).toBeDisabled();
    expect(screen.queryByRole('region', { name: 'مشهد مجلس الحرب' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'خريطة القرية' })).not.toBeInTheDocument();

    fireEvent.click(within(stable).getByRole('button', { name: 'العودة إلى المدينة' }));
    expect(screen.getByRole('region', { name: 'خريطة القرية' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'مشهد الإسطبل' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^الإسطبل، المستوى/ })).toHaveAccessibleDescription(/تدريب جارٍ/);
  });

  it('opens the military panel from pointer and keyboard without a second map', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    const view = fixture();
    const onCampaign = vi.fn();
    render(
      <VillagePanel
        view={view}
        village={view.villages[0]}
        send={vi.fn()}
        busy={false}
        onCampaign={onCampaign}
      />,
    );
    const hotspot = screen.getByRole('button', { name: 'مجلس الحرب' });
    expect(hotspot).toHaveAttribute('data-rally-point', 'true');
    hotspot.focus();
    expect(hotspot).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('region', { name: 'نقطة تجمع الجيوش' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'مشهد مجلس الحرب' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'إرسال جيش' }));
    expect(onCampaign).toHaveBeenCalledWith('attack');
    expect(screen.queryByTestId('unified-map')).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});

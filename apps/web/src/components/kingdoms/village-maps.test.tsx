import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import { VillagePanel } from './village-panel';
import { MapPanel } from './map-panel';
import type { WorldView } from './shared';

vi.mock('../mamluk-map/mamluk-world-map', () => ({
  MamlukWorldMap: () => <div data-testid="unified-map" />,
}));

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

describe('village maps', () => {
  it('keeps construction, army, tasks and world navigation available within the village', () => {
    const view = fixture();
    const onNavigate = vi.fn();
    render(
      <VillagePanel
        view={view}
        village={view.villages[0]}
        send={vi.fn()}
        busy={false}
        onNavigate={onNavigate}
      />,
    );
    const navigation = screen.getByRole('navigation', { name: 'التنقل من القرية' });
    fireEvent.click(within(navigation).getByRole('button', { name: 'البناء' }));
    expect(screen.getByRole('region', { name: 'تفاصيل دار الحكم' })).toBeInTheDocument();
    fireEvent.click(within(navigation).getByRole('button', { name: 'انتقل إلى الجيش' }));
    expect(onNavigate).toHaveBeenLastCalledWith('army');
    fireEvent.click(within(navigation).getByRole('button', { name: 'افتح المهام' }));
    expect(onNavigate).toHaveBeenLastCalledWith('reports');
    fireEvent.click(within(navigation).getByRole('button', { name: 'انتقل إلى خريطة العالم' }));
    expect(onNavigate).toHaveBeenLastCalledWith('map');
  });
  it('shows production and storage from the real farm and warehouse levels', async () => {
    const view = fixture();
    const village = {
      ...view.villages[0],
      buildings: { ...view.villages[0].buildings, farm: 3, warehouse: 2 },
    };
    render(<VillagePanel view={view} village={village} send={vi.fn()} busy={false} />);
    fireEvent.click(screen.getByRole('button', { name: /مزارع الغذاء.*المستوى [٣3]/ }));
    fireEvent.click(await screen.findByRole('tab', { name: 'إنتاج' }, { timeout: 3000 }));
    const production = screen.getByRole('tabpanel');
    expect(production).toHaveTextContent('٢٠٥ غذاء / ساعة');
    expect(production).toHaveTextContent('٥٬٠٠٠');
    expect(production).toHaveTextContent('قبل إعاشة الجيش');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'إنتاج' }), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'ترقية' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'ترقية' })).toHaveAttribute('aria-selected', 'true');
  });
  it('opens building details on selection and closes them with focus restored to the map', async () => {
    const view = fixture();
    render(<VillagePanel view={view} village={view.villages[0]} send={vi.fn()} busy={false} />);
    expect(screen.queryByRole('region', { name: 'تفاصيل دار الحكم' })).not.toBeInTheDocument();
    const hall = screen.getByRole('button', { name: /دار الحكم.*المستوى [١1]/ });
    hall.focus();
    fireEvent.click(hall);
    expect(
      await screen.findByRole('region', { name: 'تفاصيل دار الحكم' }, { timeout: 3000 }),
    ).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('region', { name: 'تفاصيل دار الحكم' }), {
      key: 'Escape',
    });
    expect(screen.queryByRole('region', { name: 'تفاصيل دار الحكم' })).not.toBeInTheDocument();
    expect(hall).toHaveFocus();
  });
  it('prevents an upgrade when the server resources cannot pay its cost', async () => {
    const view = fixture();
    const village = {
      ...view.villages[0],
      resources: { wood: 0, stone: 0, iron: 0, food: 0, gold: 0 },
    };
    const send = vi.fn();
    render(<VillagePanel view={view} village={village} send={send} busy={false} />);
    fireEvent.click(screen.getByRole('button', { name: /^الثكنة، لم يُبنَ$/ }));
    expect(
      await screen.findByRole('button', { name: 'طوّر المبنى' }, { timeout: 3000 }),
    ).toBeDisabled();
    expect(screen.getByText('الموارد الحالية لا تكفي لهذا التطوير.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'طوّر المبنى' }));
    expect(send).not.toHaveBeenCalled();
  });
  it('renders both real execution queues without inventing progress', () => {
    const view = fixture();
    const village = {
      ...view.villages[0],
      build: { building: 'farm' as const, level: 2, endsAt: now + 60000 },
      training: { unit: 'guard' as const, count: 3, endsAt: now + 120000 },
    };
    render(<VillagePanel view={view} village={village} send={vi.fn()} busy={false} />);
    const queues = screen.getByRole('region', { name: 'قوائم التنفيذ' });
    expect(within(queues).getByText(/مزارع الغذاء.*٢/)).toBeInTheDocument();
    expect(within(queues).getByText(/٣ حارس/)).toBeInTheDocument();
    expect(queues.querySelectorAll('time')).toHaveLength(2);
    expect(within(queues).queryByRole('progressbar')).not.toBeInTheDocument();
  });
  it('selects a real building lot and sends the existing build command for that building', async () => {
    const view = fixture();
    const send = vi.fn().mockResolvedValue(undefined);
    render(<VillagePanel view={view} village={view.villages[0]} send={send} busy={false} />);
    const map = screen.getByRole('region', { name: 'خريطة القرية' });
    expect(
      within(map).getByRole('button', { name: /دار الحكم.*المستوى [١1]/ }),
    ).toBeInTheDocument();
    expect(within(map).getAllByRole('button', { name: /^الثكنة،/ })).toHaveLength(1);
    expect(within(map).getAllByRole('button', { name: /^الإسطبل،/ })).toHaveLength(1);
    fireEvent.click(within(map).getByRole('button', { name: /^الثكنة، لم يُبنَ$/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'طوّر المبنى' }, { timeout: 3000 }));
    expect(send).toHaveBeenCalledWith({
      type: 'build',
      villageId: view.villages[0].id,
      building: 'barracks',
    });
  });

  it('shows the actual construction state and lets another upgrade join the queue', async () => {
    const view = fixture();
    const village = {
      ...view.villages[0],
      build: { building: 'farm' as const, level: 1, endsAt: now + 60000 },
    };
    render(<VillagePanel view={view} village={village} send={vi.fn()} busy={false} />);
    fireEvent.click(screen.getByRole('button', { name: /مزارع الغذاء.*قيد التطوير/ }));
    expect(
      await screen.findByRole('button', { name: 'أضف إلى قائمة البناء' }, { timeout: 3000 }),
    ).toBeEnabled();
  });

  it('keeps the confirmed level until a new server snapshot confirms an upgrade', async () => {
    const view = fixture();
    const send = vi.fn().mockResolvedValue(undefined);
    const rendered = render(
      <VillagePanel view={view} village={view.villages[0]} send={send} busy={false} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /مزارع الغذاء.*لم يُبنَ/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'طوّر المبنى' }, { timeout: 3000 }));
    expect(screen.getByRole('region', { name: 'تفاصيل مزارع الغذاء' })).toHaveTextContent(
      'مستوى ٠',
    );
    const updated = {
      ...view.villages[0],
      buildings: { ...view.villages[0].buildings, farm: 1 },
    };
    rendered.rerender(<VillagePanel view={view} village={updated} send={send} busy={false} />);
    expect(screen.getByRole('region', { name: 'تفاصيل مزارع الغذاء' })).toHaveTextContent(
      'مستوى ١',
    );
  });

  it('does not offer another upgrade after the configured building maximum', async () => {
    const view = fixture();
    const village = {
      ...view.villages[0],
      buildings: { ...view.villages[0].buildings, hall: 20 },
    };
    const send = vi.fn();
    render(<VillagePanel view={view} village={village} send={send} busy={false} />);
    fireEvent.click(screen.getByRole('button', { name: /دار الحكم.*المستوى/ }));
    expect(
      await screen.findByRole('button', { name: 'بلغ الحد الأعلى' }, { timeout: 3000 }),
    ).toBeDisabled();
    expect(screen.queryByRole('list', { name: 'تكلفة التطوير' })).not.toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
  });

  it('finds a distant real village and uses its coordinates as the army destination', () => {
    const original = fixture();
    const view = {
      ...original,
      map: [
        ...original.map,
        {
          id: 'other-village',
          ownerId: 'player-2',
          name: 'قرية السهول',
          kingdomName: 'مملكة السهول',
          x: 85,
          y: -63,
          protectedUntil: 0,
        },
      ],
    };
    const send = vi.fn().mockResolvedValue(undefined);
    render(<MapPanel view={view} village={view.villages[0]} send={send} busy={false} />);
    fireEvent.change(screen.getByLabelText('ابحث عن قرية أو مملكة'), {
      target: { value: 'السهول' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'اعرض قرية السهول على الخريطة' }));
    expect(screen.getByRole('button', { name: 'اعرض قرية السهول على الخريطة' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      within(screen.getByRole('region', { name: 'القرية المختارة' })).getByText('مملكة السهول'),
    ).toBeInTheDocument();
    fireEvent.submit(screen.getByRole('button', { name: 'أرسل الحملة' }).closest('form')!);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'march', targetX: 85, targetY: -63 }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'قريتي' }));
    expect(within(screen.getByRole('region', { name: 'القرية المختارة' })).getByText(original.map[0].name)).toBeInTheDocument();
  });
});

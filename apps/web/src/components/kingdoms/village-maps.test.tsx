import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import { VillagePanel } from './village-panel';
import { MapPanel } from './map-panel';
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

describe('village maps', () => {
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
  it('selects a real building lot and sends the existing build command for that building', () => {
    const view = fixture();
    const send = vi.fn().mockResolvedValue(undefined);
    render(<VillagePanel view={view} village={view.villages[0]} send={send} busy={false} />);
    const map = screen.getByRole('region', { name: 'خريطة القرية' });
    expect(within(map).getByRole('button', { name: /دار الحكم.*المستوى ١/ })).toBeInTheDocument();
    fireEvent.click(within(map).getByRole('button', { name: /الثكنة.*لم يُبنَ/ }));
    fireEvent.click(screen.getByRole('button', { name: 'طوّر المبنى' }));
    expect(send).toHaveBeenCalledWith({
      type: 'build',
      villageId: view.villages[0].id,
      building: 'barracks',
    });
  });

  it('shows the actual construction state on the map and prevents a second build', () => {
    const view = fixture();
    const village = {
      ...view.villages[0],
      build: { building: 'farm' as const, level: 1, endsAt: now + 60000 },
    };
    render(<VillagePanel view={view} village={village} send={vi.fn()} busy={false} />);
    fireEvent.click(screen.getByRole('button', { name: /مزارع الغذاء.*قيد التطوير/ }));
    expect(screen.getByRole('button', { name: 'طوّر المبنى' })).toBeDisabled();
  });

  it('links the village map and the building rail to the stage ladder', () => {
    const view = fixture();
    const village = {
      ...view.villages[0],
      buildings: { ...view.villages[0].buildings, hall: 20 },
    };
    render(<VillagePanel view={view} village={village} send={vi.fn()} busy={false} />);
    const ladder = screen.getByRole('region', { name: 'سلّم مراحل القرية' });
    expect(within(ladder).getAllByRole('listitem')).toHaveLength(5);
    const map = screen.getByRole('region', { name: 'خريطة القرية' });
    expect(
      within(map).getByRole('button', { name: /دار الحكم.*المرحلة العليا.*الحد الأعلى/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: 'تقدم دار الحكم نحو المرحلة العليا' }),
    ).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByText(/المبنى في المرحلة العليا/)).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: 'قرية السهول، X 85، Y -63' })).toHaveAttribute(
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
    expect(
      screen.getByRole('button', {
        name: `${original.map[0].name}، X ${original.map[0].x}، Y ${original.map[0].y}`,
      }),
    ).toHaveAttribute('aria-pressed', 'true');
  });
});

import { emptyTroops } from '@/lib/kingdoms/simulation';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import type { GameProps, WorldView } from '../shared';
import { StablePanel } from './stable-panel';

const now = 1800000000000;
function fixture(): GameProps {
  const world = executeCommand(
    createWorld(now),
    'player-1',
    { type: 'found', name: 'مملكتي' },
    now,
  );
  const view: WorldView = {
    ...projectWorld(world, 'player-1', now),
    worldId: 'world-1',
    worldName: 'عالم الاختبار',
    paused: false,
    revision: 0,
  };
  const village = {
    ...view.villages[0],
    buildings: { ...view.villages[0].buildings, barracks: 2, stable: 2 },
    progression: view.villages[0].progression
      ? { ...view.villages[0].progression, level: 6 }
      : view.villages[0].progression,
    troops: { ...view.villages[0].troops, rider: 3 },
    resources: { wood: 10000, stone: 10000, iron: 10000, food: 10000, gold: 10000 },
  };
  return {
    view: { ...view, villages: [village] },
    village,
    busy: false,
    send: vi.fn(async () => {}),
  };
}
const navigation = { onClose: vi.fn() };
afterEach(cleanup);

describe('StablePanel cavalry commands', () => {
  it('trains mounted archers through the stable with their own cost and queue', () => {
    const props = fixture();
    const { rerender } = render(<StablePanel {...props} {...navigation} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'وحدة الإسطبل' }), {
      target: { value: 'mounted_archer' },
    });
    const unit = props.view.config.units.mounted_archer;
    fireEvent.change(screen.getByRole('spinbutton', { name: `عدد ${unit.name}` }), {
      target: { value: '2' },
    });
    fireEvent.click(screen.getByRole('button', { name: `درّب ${unit.name}` }));
    expect(props.send).toHaveBeenCalledWith({ type: 'train', villageId: props.village.id, unit: 'mounted_archer', count: 2 });
    rerender(<StablePanel {...props} village={{ ...props.village, training: { unit: 'mounted_archer', count: 2, endsAt: now + 100000 } }} {...navigation} />);
    expect(screen.getByLabelText('قائمة تدريب القرية')).toHaveTextContent(unit.name);
    expect(screen.getByRole('button', { name: `درّب ${unit.name}` })).toBeDisabled();
  });
  it('sends the existing rider training command and waits for confirmed troops and levels', () => {
    const props = fixture();
    const { rerender } = render(<StablePanel {...props} {...navigation} />);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'عدد الفرسان' }), {
      target: { value: '2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'درّب الفرسان' }));
    expect(props.send).toHaveBeenCalledWith({
      type: 'train',
      villageId: props.village.id,
      unit: 'rider',
      count: 2,
    });
    expect(screen.getByText('مستوى الإسطبل ٢')).toBeInTheDocument();
    expect(screen.getByLabelText('الفرسان الجاهزون')).toHaveTextContent('٣');

    const confirmed = {
      ...props.village,
      buildings: { ...props.village.buildings, stable: 3 },
      troops: { ...props.village.troops, rider: 5 },
    };
    rerender(<StablePanel {...props} village={confirmed} {...navigation} />);
    expect(screen.getByText('مستوى الإسطبل ٣')).toBeInTheDocument();
    expect(screen.getByLabelText('الفرسان الجاهزون')).toHaveTextContent('٥');
  });

  it.each([
    ['missing stable', { buildings: { stable: 0 } }, 'ابنِ الإسطبل أولاً لتدريب الفرسان.'],
    [
      'active queue',
      { training: { unit: 'guard', count: 2, endsAt: now + 60000 } },
      'يوجد تدريب جارٍ. انتظر اكتماله قبل تدريب الفرسان.',
    ],
    ['insufficient iron', { resources: { iron: 0 } }, 'الموارد الحالية لا تكفي لتدريب هذا العدد.'],
    ['full army', { troops: { guard: 999997 } }, 'بلغ الجيش الحد الأعلى.'],
  ] as const)('blocks a rider command with %s', (_, change, reason) => {
    const props = fixture();
    const village = {
      ...props.village,
      ...change,
      buildings: { ...props.village.buildings, ...('buildings' in change ? change.buildings : {}) },
      resources: { ...props.village.resources, ...('resources' in change ? change.resources : {}) },
      troops: { ...props.village.troops, ...('troops' in change ? change.troops : {}) },
    };
    render(<StablePanel {...props} village={village} {...navigation} />);
    const train = screen.getByRole('button', { name: 'درّب الفرسان' });
    expect(train).toBeDisabled();
    expect(screen.getByText(reason)).toBeInTheDocument();
    fireEvent.submit(train.closest('form')!);
    expect(props.send).not.toHaveBeenCalled();
  });

  it('shows the configured cavalry cost, duration and confirmed training queue', () => {
    const props = fixture();
    const view = {
      ...props.view,
      config: {
        ...props.view.config,
        barracksSpeedPerLevel: 0.25,
        units: {
          ...props.view.config.units,
          rider: {
            ...props.view.config.units.rider,
            seconds: 50,
            cost: { wood: 10, stone: 20, iron: 30, food: 40, gold: 5 },
          },
        },
      },
    };
    const { rerender } = render(<StablePanel {...props} view={view} {...navigation} />);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'عدد الفرسان' }), {
      target: { value: '2' },
    });
    expect(screen.getByRole('list', { name: 'تكلفة تدريب الفرسان' })).toHaveTextContent('خشب٢٠');
    expect(screen.getByRole('list', { name: 'تكلفة تدريب الفرسان' })).toHaveTextContent('ذهب١٠');
    expect(screen.getByText(/مدة تدريب العدد المختار/)).toHaveTextContent('1:20');
    rerender(
      <StablePanel
        {...props}
        view={view}
        village={{ ...props.village, training: { unit: 'rider', count: 2, endsAt: now + 80000 } }}
        {...navigation}
      />,
    );
    expect(screen.getByLabelText('قائمة تدريب القرية')).toHaveTextContent('٢ خيّال');
    expect(screen.getByLabelText('قائمة تدريب القرية').querySelector('time')).toHaveAttribute(
      'dateTime',
      '2027-01-15T08:01:20.000Z',
    );
  });

  it('focuses the sheet title and queues a real stable upgrade or the army', () => {
    const props = fixture();
    const onClose = vi.fn();
    const onNavigate = vi.fn();
    render(
      <StablePanel
        {...props}
        onClose={onClose}
        onNavigate={onNavigate}
      />,
    );
    expect(screen.getByRole('heading', { name: 'الإسطبل' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'طوّر الإسطبل' }));
    expect(props.send).toHaveBeenCalledWith({
      type: 'build',
      villageId: props.village.id,
      building: 'stable',
    });
    fireEvent.click(screen.getByRole('button', { name: 'جهّز الجيش' }));
    expect(onNavigate).toHaveBeenCalledWith('army');
    fireEvent.keyDown(screen.getByRole('region', { name: 'تفاصيل الإسطبل' }), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('includes visible marching troops in the army limit without blocking an eligible count', () => {
    const props = fixture();
    const village = { ...props.village, troops: { ...props.village.troops, guard: 999990 } };
    const view = {
      ...props.view,
      movements: [
        {
          id: 'movement-1',
          ownerId: village.ownerId,
          sourceId: village.id,
          targetX: 1,
          targetY: 1,
          mission: 'raid' as const,
          troops: { ...emptyTroops(), guard: 0, rider: 5, scout: 0, settler: 0 },
          departedAt: now,
          arrivesAt: now + 1000,
          travelMs: 1000,
          loot: { wood: 0, stone: 0, iron: 0, food: 0, gold: 0 },
        },
      ],
    };
    render(<StablePanel {...props} view={view} village={village} {...navigation} />);
    const count = screen.getByRole('spinbutton', { name: 'عدد الفرسان' });
    expect(count).toHaveAttribute('max', '2');
    fireEvent.change(count, { target: { value: '3' } });
    expect(screen.getByRole('button', { name: 'درّب الفرسان' })).toBeDisabled();
    fireEvent.change(count, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'درّب الفرسان' }));
    expect(props.send).toHaveBeenCalledWith({
      type: 'train',
      villageId: village.id,
      unit: 'rider',
      count: 2,
    });
  });

  it.each(['0', '1.5', '10001'])('does not submit an invalid count of %s', (count) => {
    const props = fixture();
    render(<StablePanel {...props} {...navigation} />);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'عدد الفرسان' }), {
      target: { value: count },
    });
    const train = screen.getByRole('button', { name: 'درّب الفرسان' });
    expect(train).toBeDisabled();
    fireEvent.submit(train.closest('form')!);
    expect(props.send).not.toHaveBeenCalled();
  });
});

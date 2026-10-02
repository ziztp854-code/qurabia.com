import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import type { Movement, Village } from '@/lib/kingdoms/types';
import { number, type WorldView } from '../shared';
import { VillageActivity } from './village-activity';

const now = 1800000000000;
const initial = projectWorld(
  executeCommand(createWorld(now), 'p', { type: 'found', name: 'اختبار' }, now), 'p', now,
);
const view: WorldView = { ...initial, worldId: 'test', worldName: 'اختبار', revision: 0, paused: false };
const village = view.villages[0];
function movement(id: string, overrides: Partial<Movement> = {}): Movement {
  return {
    id, ownerId: 'p', sourceId: village.id, targetX: village.x + 1, targetY: village.y + 1,
    mission: 'reinforce', troops: { guard: 1, rider: 0, scout: 0, settler: 0 },
    departedAt: now, arrivesAt: now + 60000, travelMs: 60000,
    loot: { wood: 0, stone: 0, iron: 0, food: 0, gold: 0 }, ...overrides,
  };
}
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('VillageActivity', () => {
  it('explains idle queues and reports only confirmed troops in the chosen village', () => {
    const onFocus = vi.fn();
    render(<VillageActivity view={view} village={{ ...village, troops: { guard: 9, rider: 2, scout: 0, settler: 0 } }} onFocus={onFocus} />);
    const activity = screen.getByRole('region', { name: 'نشاط القرية' });
    expect(within(activity).getByText('لا بناء قيد التنفيذ')).toBeInTheDocument();
    expect(within(activity).getByText('لا وحدات قيد التدريب')).toBeInTheDocument();
    expect(within(activity).getByText('لا تحركات من القرية أو إليها')).toBeInTheDocument();
    expect(within(activity).getByText(`${number(11)} وحدة من قواتك في القرية`)).toBeInTheDocument();
    fireEvent.click(within(activity).getByRole('button', { name: 'إدارة البناء' }));
    expect(onFocus).toHaveBeenCalledWith('hall');
  });

  it('keeps a pending construction target distinct from the confirmed level', () => {
    const active: Village = { ...village, buildings: { ...village.buildings, barracks: 3 },
      build: { building: 'barracks', level: 4, startedAt: now, endsAt: now + 60000 } };
    const onFocus = vi.fn();
    render(<VillageActivity view={view} village={active} onFocus={onFocus} />);
    expect(screen.getByText(`الحالي ${number(3)} · قيد البناء ${number(4)}`)).toBeInTheDocument();
    expect(screen.queryByText(/اكتمل/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'متابعة البناء' }));
    expect(onFocus).toHaveBeenCalledWith('barracks');
    expect(active.buildings.barracks).toBe(3);
  });

  it('shows actual training quantity separately from available soldiers and focuses rider training', () => {
    const onFocus = vi.fn();
    render(<VillageActivity view={view} village={{ ...village,
      troops: { guard: 0, rider: 2, scout: 0, settler: 0 },
      training: { unit: 'rider', count: 6, endsAt: now + 60000 } }} onFocus={onFocus} />);
    expect(screen.getByText(`${number(6)} ${view.config.units.rider.name} قيد التدريب`)).toBeInTheDocument();
    expect(screen.getByText(`${number(2)} وحدة من قواتك في القرية`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'متابعة التدريب' }));
    expect(onFocus).toHaveBeenCalledWith('stable');
  });

  it('filters out movements belonging to other villages and names the next local arrival', () => {
    const movements = [
      movement('outbound'),
      movement('inbound', { sourceId: 'other', targetX: village.x, targetY: village.y, mission: 'attack', arrivesAt: now + 30000 }),
      movement('unrelated', { sourceId: 'other', targetX: village.x + 3, targetY: village.y + 3, arrivesAt: now + 10000, mission: 'settle' }),
    ];
    render(<VillageActivity view={{ ...view, movements }} village={village} />);
    expect(screen.getByText(`قادمة ${number(1)} · مغادرة ${number(1)}`)).toBeInTheDocument();
    expect(screen.getByText('الوصول التالي: هجوم إلى القرية')).toBeInTheDocument();
    expect(screen.queryByText(/استيطان/)).not.toBeInTheDocument();
  });

  it('never treats an expired server queue as confirmed completion', () => {
    const build = { building: 'hall' as const, level: village.buildings.hall + 1, endsAt: now - 1 };
    render(<VillageActivity view={view} village={{ ...village, build }} />);
    expect(screen.getByText('بانتظار تأكيد الاكتمال')).toBeInTheDocument();
    expect(screen.queryByText(/^اكتمل/)).not.toBeInTheDocument();
    expect(village.buildings.hall).toBe(view.villages[0].buildings.hall);
  });

  it('names resource collection using the actual movement mission', () => {
    render(<VillageActivity view={{ ...view, movements: [movement('gathering', { mission: 'gather' })] }} village={village} />);
    expect(screen.getByText('الوصول التالي: جمع الموارد من القرية')).toBeInTheDocument();
  });

  it('retains elapsed presentation time when a queue changes at the same server snapshot', () => {
    vi.useFakeTimers();
    let elapsed = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
    const active = { ...village, training: { unit: 'guard' as const, count: 1, endsAt: now + 60000 } };
    const { rerender } = render(<VillageActivity view={view} village={active} />);
    act(() => { elapsed = 20000; vi.advanceTimersByTime(1000); });
    expect(screen.getByLabelText('الوقت المتبقي للتدريب')).toHaveTextContent('00:40');
    rerender(<VillageActivity view={view} village={{ ...active, training: { ...active.training, endsAt: now + 120000 } }} />);
    expect(screen.getByLabelText('الوقت المتبقي للتدريب')).toHaveTextContent('01:40');
    act(() => { elapsed = 21000; vi.advanceTimersByTime(1000); });
    expect(screen.getByLabelText('الوقت المتبقي للتدريب')).toHaveTextContent('01:39');
  });

  it('freezes the remaining duration while the world is paused', () => {
    vi.useFakeTimers();
    const interval = vi.spyOn(globalThis, 'setInterval');
    render(<VillageActivity view={{ ...view, paused: true }} village={{ ...village,
      training: { unit: 'guard', count: 1, endsAt: now + 60000 } }} />);
    expect(screen.getByText('العالم متوقف مؤقتًا')).toBeInTheDocument();
    expect(screen.getByLabelText('الوقت المتبقي للتدريب')).toHaveTextContent('01:00');
    expect(interval).not.toHaveBeenCalled();
  });

  it('resets the displayed duration from a new server snapshot instead of using browser wall time', () => {
    const active = { ...village, training: { unit: 'guard' as const, count: 1, endsAt: now + 60000 } };
    const { rerender } = render(<VillageActivity view={view} village={active} />);
    expect(screen.getByLabelText('الوقت المتبقي للتدريب')).toHaveTextContent('01:00');
    rerender(<VillageActivity view={{ ...view, serverNow: now + 15000, revision: 1 }} village={active} />);
    expect(screen.getByLabelText('الوقت المتبقي للتدريب')).toHaveTextContent('00:45');
    expect(screen.queryByText(/اكتمل/)).not.toBeInTheDocument();
  });

  it('counts presentation time monotonically, waits for server confirmation, and cleans up its timer', () => {
    vi.useFakeTimers();
    let elapsed = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
    const clear = vi.spyOn(globalThis, 'clearInterval');
    const active = { ...village, training: { unit: 'guard' as const, count: 1, endsAt: now + 3000 } };
    const { unmount } = render(<VillageActivity view={view} village={active} />);
    expect(screen.getByLabelText('الوقت المتبقي للتدريب')).toHaveTextContent('00:03');
    act(() => { elapsed = 2000; vi.advanceTimersByTime(1000); });
    expect(screen.getByLabelText('الوقت المتبقي للتدريب')).toHaveTextContent('00:01');
    act(() => { elapsed = 4000; vi.advanceTimersByTime(1000); });
    expect(screen.getByText('بانتظار تأكيد الاكتمال')).toBeInTheDocument();
    expect(active.training?.count).toBe(1);
    expect(active.troops).toEqual(village.troops);
    unmount();
    expect(clear).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('starts the new village clock from its server snapshot and cancels the old clock', () => {
    vi.useFakeTimers();
    let elapsed = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
    const active = { ...village, training: { unit: 'guard' as const, count: 1, endsAt: now + 60000 } };
    const { rerender } = render(<VillageActivity view={view} village={active} />);
    act(() => { elapsed = 15000; vi.advanceTimersByTime(1000); });
    expect(screen.getByLabelText('الوقت المتبقي للتدريب')).toHaveTextContent('00:45');
    rerender(<VillageActivity view={view} village={{ ...active, id: 'other-village' }} />);
    expect(screen.getByLabelText('الوقت المتبقي للتدريب')).toHaveTextContent('01:00');
    expect(vi.getTimerCount()).toBe(1);
  });
});

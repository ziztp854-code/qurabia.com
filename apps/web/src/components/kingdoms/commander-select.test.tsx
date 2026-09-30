import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import type { CommanderView, ResourceSiteView } from '@/lib/kingdoms/types';
import { CommanderSelect } from './commander-select';
import { GatheringPanel } from './resource-site-panel';
import { MapPanel } from './map-panel';
import type { WorldView } from './shared';

const now = 1800000000000;
const commander: CommanderView = {
  id: 'amir-1',
  playerId: 'alice',
  name: 'بيبرس',
  level: 1,
  experience: 0,
  specialization: 'cavalry',
  attack: 5,
  defense: 5,
  mobility: 5,
  siege: 5,
  logistics: 5,
  status: 'available',
  rankKey: 'commander.rank.mamluk',
  nextLevelExperience: 100,
};
const site: ResourceSiteView = {
  id: 'wood:2,2',
  name: 'غابة الخشب',
  x: 2,
  y: 2,
  resource: 'wood',
  available: 450,
  capacity: 600,
  regenerationPerHour: 100,
};
function fixture(): WorldView {
  const world = executeCommand(createWorld(now), 'alice', { type: 'found', name: 'مملكتي' }, now);
  return {
    ...projectWorld(world, 'alice', now),
    commanders: [commander],
    worldId: 'world-1',
    worldName: 'اختبار',
    revision: 0,
    paused: false,
    resourceSites: [site],
  };
}
afterEach(cleanup);

describe('army commander selection', () => {
  it('allows available commanders and defense assigned to this origin only', () => {
    const base = fixture();
    const origin = base.villages[0].id;
    const view = {
      ...base,
      commanders: [
        commander,
        {
          ...commander,
          id: 'assigned-here',
          name: 'قلاوون',
          status: 'assigned' as const,
          villageId: origin,
        },
        {
          ...commander,
          id: 'assigned-away',
          name: 'بعيد',
          status: 'assigned' as const,
          villageId: 'other-village',
        },
        { ...commander, id: 'busy', name: 'مسافر', status: 'marching' as const },
        { ...commander, id: 'garrison', name: 'تعزيز', status: 'deployed' as const },
        { ...commander, id: 'recovering', name: 'متعافٍ', cooldownUntil: now + 60000 },
      ],
    };
    render(
      <CommanderSelect
        view={view}
        villageId={origin}
        value=""
        onChange={vi.fn()}
        disabled={false}
      />,
    );
    const select = screen.getByRole('combobox', { name: 'قائد الحملة' });
    expect(within(select).getAllByRole('option')).toHaveLength(3);
    expect(within(select).getByRole('option', { name: /بيبرس/ })).toBeVisible();
    expect(within(select).getByRole('option', { name: /قلاوون/ })).toBeVisible();
    expect(
      within(select).queryByRole('option', { name: /بعيد|مسافر|تعزيز|متعافٍ/ }),
    ).not.toBeInTheDocument();
  });
  it('sends the selected commander with a gathering army and no derived strength or XP', () => {
    const view = fixture();
    const village = {
      ...view.villages[0],
      x: 0,
      y: 0,
      troops: { guard: 10, rider: 2, scout: 0, settler: 0 },
    };
    const send = vi.fn();
    render(<GatheringPanel view={view} village={village} busy={false} send={send} site={site} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'قائد الحملة' }), {
      target: { value: commander.id },
    });
    fireEvent.change(screen.getByLabelText(/حارس .*متاح/), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'أرسل الجيش لجمع الموارد' }));
    expect(send).toHaveBeenCalledWith({
      type: 'march',
      villageId: village.id,
      targetX: 2,
      targetY: 2,
      mission: 'gather',
      commanderId: commander.id,
      troops: { guard: 3, rider: 0, scout: 0, settler: 0 },
    });
  });
  it('blocks a stale selection after a server refresh while letting the user remove it', () => {
    const view = fixture();
    const village = {
      ...view.villages[0],
      x: 0,
      y: 0,
      troops: { guard: 10, rider: 2, scout: 0, settler: 0 },
    };
    const send = vi.fn();
    const { rerender } = render(
      <GatheringPanel view={view} village={village} busy={false} send={send} site={site} />,
    );
    fireEvent.change(screen.getByRole('combobox', { name: 'قائد الحملة' }), {
      target: { value: commander.id },
    });
    fireEvent.change(screen.getByLabelText(/حارس .*متاح/), { target: { value: '3' } });
    rerender(
      <GatheringPanel
        view={{ ...view, commanders: [{ ...commander, status: 'marching' }] }}
        village={village}
        busy={false}
        send={send}
        site={site}
      />,
    );
    expect(screen.getByRole('button', { name: 'أرسل الجيش لجمع الموارد' })).toBeDisabled();
    fireEvent.submit(screen.getByRole('combobox', { name: 'قائد الحملة' }).closest('form')!);
    expect(send).not.toHaveBeenCalled();
    const select = screen.getByRole('combobox', { name: 'قائد الحملة' });
    expect(select).toBeEnabled();
    expect(select).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(select, { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'أرسل الجيش لجمع الموارد' })).toBeEnabled();
  });
  it('includes the commander on map missions and keeps a stale selector editable', () => {
    const view = { ...fixture(), resourceSites: [] };
    const village = { ...view.villages[0], troops: { guard: 10, rider: 2, scout: 0, settler: 0 } };
    const send = vi.fn();
    const { rerender } = render(
      <MapPanel view={view} village={village} busy={false} send={send} />,
    );
    fireEvent.change(screen.getByRole('combobox', { name: 'قائد الحملة' }), {
      target: { value: commander.id },
    });
    fireEvent.change(screen.getByLabelText(/حارس .*متاح/), { target: { value: '3' } });
    const form = screen.getByLabelText('نوع الحملة').closest('form')!;
    fireEvent.submit(form);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        commanderId: commander.id,
        troops: { guard: 3, rider: 0, scout: 0, settler: 0 },
      }),
    );
    send.mockClear();
    rerender(
      <MapPanel
        view={{ ...view, commanders: [{ ...commander, status: 'marching' }] }}
        village={village}
        busy={false}
        send={send}
      />,
    );
    expect(screen.getByRole('button', { name: 'أرسل الحملة' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'قائد الحملة' })).toBeEnabled();
    fireEvent.submit(form);
    expect(send).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('combobox', { name: 'قائد الحملة' }), {
      target: { value: '' },
    });
    expect(screen.getByRole('button', { name: 'أرسل الحملة' })).toBeEnabled();
  });
});

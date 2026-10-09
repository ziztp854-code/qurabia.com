import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import { emptyTroops, storageCapacity } from '@/lib/kingdoms/simulation';
import type { CommanderView, ResourceSiteView } from '@/lib/kingdoms/types';
import { MapPanel } from './map-panel';
import { GatheringPanel, ResourceSiteDirectory } from './resource-site-panel';
import type { GameProps, WorldView } from './shared';

vi.mock('../mamluk-map/mamluk-world-map', () => ({
  MamlukWorldMap: () => <div data-testid="unified-map" />,
}));

const now = 1800000000000;
const sites: ResourceSiteView[] = [
  {
    id: 'wood:2,2',
    x: 2,
    y: 2,
    resource: 'wood',
    name: 'غابة الخشب',
    available: 450,
    capacity: 600,
    regenerationPerHour: 100,
  },
  {
    id: 'iron:-2,2',
    x: -2,
    y: 2,
    resource: 'iron',
    name: 'منجم الحديد',
    available: 0,
    capacity: 600,
    regenerationPerHour: 100,
  },
  {
    id: 'food:2,-2',
    x: 2,
    y: -2,
    resource: 'food',
    name: 'حقل القمح',
    available: 600,
    capacity: 600,
    regenerationPerHour: 100,
  },
];
function fixture(): GameProps {
  const w = executeCommand(createWorld(now), 'alice', { type: 'found', name: 'مملكة النور' }, now);
  const view: WorldView = {
    ...projectWorld(w, 'alice', now),
    worldId: 'world-1',
    worldName: 'عالم الاختبار',
    paused: false,
    revision: 0,
    resourceSites: sites,
  };
  const village = {
    ...view.villages[0],
    x: 0,
    y: 0,
    troops: { ...emptyTroops(), guard: 10, rider: 2, scout: 1, settler: 0 },
  };
  return { view, village, busy: false, send: vi.fn().mockResolvedValue(undefined) };
}
afterEach(cleanup);

describe('resource gathering interface', () => {
  it('previews the commander-adjusted arrival and permits a trip that now fits before season end', () => {
    const props = fixture();
    const commander: CommanderView = {
      id: 'amir-travel',
      playerId: 'alice',
      name: 'بيبرس',
      level: 50,
      experience: 5000,
      specialization: 'cavalry',
      attack: 50,
      defense: 50,
      mobility: 50,
      siege: 50,
      logistics: 50,
      status: 'available',
      rankKey: 'commander.rank.atabek',
      nextLevelExperience: null,
    };
    const view = {
      ...props.view,
      commanders: [commander],
      config: {
        ...props.view.config,
        // Isolate the commander/season boundary from the new default travel policy.
        armyTravelTimeFactor: 1,
        secondsPerTile: 100,
        units: {
          ...props.view.config.units,
          guard: { ...props.view.config.units.guard, speed: 1 },
        },
      },
      season: { ...props.view.season, endsAt: now + 350000 },
    };
    render(<GatheringPanel {...props} view={view} site={{ ...sites[0], x: 2, y: 0 }} />);
    fireEvent.change(screen.getByLabelText(/حارس .*متاح/), { target: { value: '1' } });
    expect(screen.getByRole('button', { name: 'أرسل الجيش لجمع الموارد' })).toBeDisabled();
    fireEvent.change(screen.getByRole('combobox', { name: 'قائد الحملة' }), {
      target: { value: commander.id },
    });
    expect(screen.getByRole('button', { name: 'أرسل الجيش لجمع الموارد' })).toBeEnabled();
    const arrival = screen.getByText(/الوصول المتوقع:/).querySelector('time');
    const returning = screen.getByText(/العودة المتوقعة:/).querySelector('time');
    expect(arrival).toHaveAttribute('dateTime', new Date(now + 173914).toISOString());
    expect(returning).toHaveAttribute('dateTime', new Date(now + 347828).toISOString());
    fireEvent.click(screen.getByRole('button', { name: 'أرسل الجيش لجمع الموارد' }));
    expect(props.send).toHaveBeenCalledWith(
      expect.objectContaining({ commanderId: commander.id, mission: 'gather' }),
    );
  });
  it('explains an out-of-season extreme journey without rendering invalid forecast dates', () => {
    const props = fixture();
    render(
      <GatheringPanel
        {...props}
        village={{ ...props.village, x: -998, y: 0 }}
        site={{ ...sites[0], x: 998, y: 0 }}
        view={{
          ...props.view,
          config: {
            ...props.view.config,
            secondsPerTile: 1e9,
            units: {
              ...props.view.config.units,
              guard: { ...props.view.config.units.guard, speed: 0.01 },
            },
          },
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText(/حارس .*متاح/), { target: { value: '1' } });
    expect(screen.getByText(/لن يعود الجيش قبل نهاية الموسم/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'أرسل الجيش لجمع الموارد' })).toBeDisabled();
    expect(screen.queryByText(/الوصول المتوقع:/)).not.toBeInTheDocument();
    expect(props.send).not.toHaveBeenCalled();
  });
  it('shows real stocks and filters nearest sites without hiding empty sites', () => {
    const onLocate = vi.fn();
    render(
      <ResourceSiteDirectory
        sites={sites}
        origin={{ x: 0, y: 0 }}
        target={{ x: 0, y: 0 }}
        onLocate={onLocate}
      />,
    );
    const directory = screen.getByRole('region', { name: 'مواقع الموارد القريبة' });
    expect(within(directory).getAllByRole('button')).toHaveLength(3);
    fireEvent.change(screen.getByLabelText('نوع المورد'), { target: { value: 'food' } });
    const button = within(directory).getByRole('button', { name: /اعرض حقل القمح/ });
    fireEvent.click(button);
    expect(onLocate).toHaveBeenCalledWith(sites[2]);
    expect(within(directory).getAllByRole('button')).toHaveLength(1);
  });

  it('centers the selected site and opens its gathering form from the directory', () => {
    const props = fixture();
    render(<MapPanel {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /اعرض غابة الخشب على الخريطة/ }));
    const panel = screen.getByRole('region', { name: 'جمع الموارد' });
    expect(within(panel).getByRole('heading', { name: 'غابة الخشب' })).toBeVisible();
    expect(within(panel).getByRole('heading', { name: 'غابة الخشب' })).toHaveFocus();
    expect(within(panel).getByText(/٤٥٠ من ٦٠٠/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'أرسل الجيش لجمع الموارد' })).toBeDisabled();
  });

  it('keeps the directory bounded and usable with the keyboard', async () => {
    const manySites = Array.from({ length: 20 }, (_, index) => ({
      ...sites[0],
      id: `wood-${index}`,
      x: index + 1,
      y: 0,
    }));
    const onLocate = vi.fn();
    render(
      <ResourceSiteDirectory
        sites={manySites}
        origin={{ x: 0, y: 0 }}
        target={{ x: 0, y: 0 }}
        onLocate={onLocate}
      />,
    );
    const directory = screen.getByRole('region', { name: 'مواقع الموارد القريبة' });
    expect(within(directory).getAllByRole('button')).toHaveLength(12);
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByLabelText('نوع المورد')).toHaveFocus();
    await user.tab();
    expect(within(directory).getAllByRole('button')[0]).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onLocate).toHaveBeenCalledWith(manySites[0]);
  });

  it('explains empty filters and blocks excess troops or stopped worlds', () => {
    const props = fixture();
    const { unmount } = render(
      <ResourceSiteDirectory
        sites={[sites[0]]}
        origin={{ x: 0, y: 0 }}
        target={{ x: 0, y: 0 }}
        onLocate={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('نوع المورد'), { target: { value: 'food' } });
    expect(screen.getByText(/لا مواقع لهذا المورد مكشوفة قرب قراك/)).toBeVisible();
    unmount();
    const { rerender } = render(<GatheringPanel {...props} site={sites[0]} />);
    fireEvent.change(screen.getByLabelText(/حارس .*متاح/), { target: { value: '11' } });
    expect(screen.getByText(/اختر عددًا من القوات المتاحة/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'أرسل الجيش لجمع الموارد' })).toBeDisabled();
    rerender(<GatheringPanel {...props} view={{ ...props.view, paused: true }} site={sites[0]} />);
    expect(screen.getByText('العالم متوقف مؤقتًا.')).toBeVisible();
    rerender(
      <GatheringPanel
        {...props}
        view={{ ...props.view, season: { ...props.view.season, status: 'ended' } }}
        site={sites[0]}
      />,
    );
    expect(screen.getByText('انتهى الموسم.')).toBeVisible();
  });

  it('sends only the selected army, coordinates and gather mission, and shows route/carry estimates', () => {
    const props = fixture();
    render(<GatheringPanel {...props} site={sites[0]} />);
    fireEvent.change(screen.getByLabelText(/حارس .*متاح/), { target: { value: '3' } });
    expect(screen.getByText(/سعة حمل الجيش:/)).toHaveTextContent('١٢٠');
    expect(screen.getByText(/الجمع المتوقع:/)).toHaveTextContent('١٢٠ خشب');
    fireEvent.click(screen.getByRole('button', { name: 'أرسل الجيش لجمع الموارد' }));
    expect(props.send).toHaveBeenCalledWith({
      type: 'march',
      villageId: props.village.id,
      targetX: 2,
      targetY: 2,
      mission: 'gather',
      troops: { ...emptyTroops(), guard: 3, rider: 0, scout: 0, settler: 0 },
    });
    expect(screen.queryByText('تم إرسال الجيش')).not.toBeInTheDocument();
  });

  it('blocks an empty site or an army of scouts with no carrying capacity', () => {
    const props = fixture();
    const { rerender } = render(<GatheringPanel {...props} site={sites[1]} />);
    fireEvent.change(screen.getByLabelText(/حارس .*متاح/), { target: { value: '1' } });
    expect(screen.getByText(/الموقع ناضب الآن/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'أرسل الجيش لجمع الموارد' })).toBeDisabled();
    rerender(<GatheringPanel {...props} site={sites[0]} />);
    fireEvent.change(screen.getByLabelText(/حارس .*متاح/), { target: { value: '0' } });
    fireEvent.change(
      screen.getByLabelText(new RegExp(`${props.view.config.units.scout.name}.*متاح`)),
      { target: { value: '1' } },
    );
    expect(screen.getByText(/اختر قوات تستطيع حمل الموارد/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'أرسل الجيش لجمع الموارد' })).toBeDisabled();
  });

  it('warns about warehouse overflow without preventing departure', () => {
    const props = fixture();
    const capacity = storageCapacity(props.view.config, props.village);
    render(
      <GatheringPanel
        {...props}
        village={{ ...props.village, resources: { ...props.village.resources, wood: capacity } }}
        site={sites[0]}
      />,
    );
    fireEvent.change(screen.getByLabelText(/حارس .*متاح/), { target: { value: '1' } });
    expect(screen.getByText(/أنفق بعض الخشب قبل عودة الجيش/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'أرسل الجيش لجمع الموارد' })).toBeEnabled();
  });

  it('blocks dispatch while busy or when the full journey would finish after the season', () => {
    const props = fixture();
    const { rerender } = render(<GatheringPanel {...props} busy site={sites[0]} />);
    expect(screen.getByRole('button', { name: 'أرسل الجيش لجمع الموارد' })).toBeDisabled();
    rerender(
      <GatheringPanel
        {...props}
        view={{ ...props.view, season: { ...props.view.season, endsAt: now + 1000 } }}
        site={sites[0]}
      />,
    );
    fireEvent.change(screen.getByLabelText(/حارس .*متاح/), { target: { value: '1' } });
    expect(screen.getByText(/لن يعود الجيش قبل نهاية الموسم/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'أرسل الجيش لجمع الموارد' })).toBeDisabled();
  });
});

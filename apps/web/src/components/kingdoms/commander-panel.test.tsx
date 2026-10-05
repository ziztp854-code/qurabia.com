import { emptyTroops } from '@/lib/kingdoms/simulation';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import type { WorldView } from './shared';
import { CommanderPanel } from './commander-panel';
import type { CommanderView } from '@/lib/kingdoms/types';
import { ArmyPanel } from './village-panel';

const now = 1800000000000;
function fixture(): WorldView {
  const world = executeCommand(
    createWorld(now),
    'alice',
    { type: 'found', name: 'مملكة النور' },
    now,
  );
  return {
    ...projectWorld(world, 'alice', now),
    worldId: 'world-1',
    worldName: 'اختبار',
    revision: 0,
    paused: false,
  };
}
afterEach(cleanup);
const commander: CommanderView = {
  id: 'commander-1',
  playerId: 'alice',
  name: 'بيبرس',
  level: 10,
  experience: 1500,
  specialization: 'cavalry',
  attack: 14,
  defense: 14,
  mobility: 14,
  siege: 14,
  logistics: 14,
  status: 'available',
  rankKey: 'commander.rank.amirTen',
  nextLevelExperience: 2000,
};

describe('commander management', () => {
  it('recruits through a server command without inventing a commander locally', () => {
    const view = fixture();
    const send = vi.fn().mockResolvedValue(undefined);
    render(<CommanderPanel view={view} village={view.villages[0]} busy={false} send={send} />);
    fireEvent.change(screen.getByLabelText('اسم القائد'), { target: { value: 'بيبرس' } });
    fireEvent.change(screen.getByLabelText('تخصص القائد'), { target: { value: 'cavalry' } });
    fireEvent.click(screen.getByRole('button', { name: 'وظّف القائد' }));
    expect(send).toHaveBeenCalledWith({
      type: 'commanderRecruit',
      villageId: view.villages[0].id,
      name: 'بيبرس',
      specialization: 'cavalry',
    });
    expect(
      screen.getByText('لا أمراء في مملكتك بعد. وظّف قائدًا ثم عيّنه للدفاع أو أرسله مع جيشك.'),
    ).toBeVisible();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });
  it('shows the server rank and XP and assigns defense without changing the roster optimistically', () => {
    const view = { ...fixture(), commanders: [commander] };
    const send = vi.fn().mockResolvedValue(undefined);
    render(<CommanderPanel view={view} village={view.villages[0]} busy={false} send={send} />);
    const card = screen.getByRole('article', { name: 'بيبرس' });
    expect(within(card).getByText('أمير عشرة · قائد فرسان')).toBeVisible();
    expect(within(card).getByText(/خبرة المستوى التالي/)).toHaveTextContent('٢٬٠٠٠');
    fireEvent.click(within(card).getByRole('button', { name: 'عيّن للدفاع هنا' }));
    expect(send).toHaveBeenCalledWith({
      type: 'commanderAssign',
      commanderId: commander.id,
      villageId: view.villages[0].id,
    });
    expect(within(card).getByText('متاح')).toBeVisible();
  });
  it('removes an existing defense assignment but cannot assign two commanders to one village', () => {
    const base = fixture();
    const view = {
      ...base,
      commanders: [
        { ...commander, status: 'assigned' as const, villageId: base.villages[0].id },
        { ...commander, id: 'commander-2', name: 'قلاوون' },
      ],
    };
    const village = { ...view.villages[0], commanderId: commander.id };
    const send = vi.fn().mockResolvedValue(undefined);
    render(<CommanderPanel view={view} village={village} busy={false} send={send} />);
    expect(screen.getByRole('button', { name: 'عيّن للدفاع هنا' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'أخلِ التعيين' }));
    expect(send).toHaveBeenCalledWith({ type: 'commanderUnassign', commanderId: commander.id });
  });
  it('uses native keyboard controls and blocks requests during processing', async () => {
    const view = fixture();
    const send = vi.fn().mockResolvedValue(undefined);
    const props = { view, village: view.villages[0], busy: false, send };
    const { rerender } = render(<CommanderPanel {...props} />);
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByLabelText('اسم القائد')).toHaveFocus();
    await user.type(screen.getByLabelText('اسم القائد'), 'قلاوون');
    await user.tab();
    expect(screen.getByLabelText('تخصص القائد')).toHaveFocus();
    await user.selectOptions(screen.getByLabelText('تخصص القائد'), 'defense');
    await user.tab();
    await user.keyboard('{Enter}');
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ specialization: 'defense' }));
    send.mockClear();
    rerender(<CommanderPanel {...props} busy />);
    expect(screen.getByLabelText('اسم القائد')).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('جارٍ تنفيذ الأمر');
    fireEvent.submit(screen.getByLabelText('اسم القائد').closest('form')!);
    expect(send).not.toHaveBeenCalled();
  });
  it('honors recruitment cost and cap from the server config and blocks ended or paused worlds', () => {
    const view = fixture();
    const send = vi.fn();
    const props = { view, village: view.villages[0], busy: false, send };
    const { rerender } = render(
      <CommanderPanel
        {...props}
        view={{
          ...view,
          commanders: [commander],
          config: { ...view.config, commanders: { ...view.config.commanders!, maxPerPlayer: 1 } },
        }}
      />,
    );
    expect(screen.getByText('بلغت الحد الأقصى للأمراء في مملكتك.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'وظّف القائد' })).toBeDisabled();
    rerender(
      <CommanderPanel
        {...props}
        village={{ ...props.village, resources: { wood: 0, stone: 0, iron: 0, food: 0, gold: 0 } }}
      />,
    );
    expect(screen.getByText('موارد القرية لا تكفي لتوظيف قائد.')).toBeVisible();
    rerender(<CommanderPanel {...props} view={{ ...view, paused: true }} />);
    expect(screen.getByRole('button', { name: 'وظّف القائد' })).toBeDisabled();
    rerender(
      <CommanderPanel {...props} view={{ ...view, season: { ...view.season, status: 'ended' } }} />,
    );
    expect(screen.getByRole('button', { name: 'وظّف القائد' })).toBeDisabled();
  });
  it('shows real missions and recovery while keeping marching and deployed commanders unavailable', () => {
    const base = fixture();
    const view = {
      ...base,
      commanders: [
        { ...commander, status: 'marching' as const },
        { ...commander, id: 'recovery', name: 'قلاوون', cooldownUntil: now + 60000 },
        {
          ...commander,
          id: 'garrison',
          name: 'الناصر',
          status: 'deployed' as const,
          villageId: base.villages[0].id,
          homeVillageId: base.villages[0].id,
        },
      ],
      movements: [
        {
          id: 'move-1',
          commanderId: commander.id,
          ownerId: 'alice',
          sourceId: base.villages[0].id,
          targetX: 2,
          targetY: 3,
          mission: 'attack' as const,
          troops: { ...emptyTroops(), guard: 5, rider: 0, scout: 0, settler: 0 },
          departedAt: now,
          arrivesAt: now + 10000,
          travelMs: 10000,
          loot: { wood: 0, stone: 0, iron: 0, food: 0, gold: 0 },
        },
      ],
    };
    render(<CommanderPanel view={view} village={view.villages[0]} busy={false} send={vi.fn()} />);
    const marching = screen.getByRole('article', { name: 'بيبرس' });
    expect(within(marching).getByText(/هجوم · الوجهة/)).toHaveTextContent('(2, 3)');
    expect(within(marching).queryByRole('button')).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('article', { name: 'قلاوون' })).getByRole('button', {
        name: 'عيّن للدفاع هنا',
      }),
    ).toBeDisabled();
    expect(
      within(screen.getByRole('article', { name: 'الناصر' })).getByText('مع تعزيزات متمركزة'),
    ).toBeVisible();
  });
  it('renders English localization and an honest missing-config state', () => {
    const view = {
      ...fixture(),
      commanders: [{ ...commander, level: 50, nextLevelExperience: null }],
    };
    const props = { view, village: view.villages[0], busy: false, send: vi.fn() };
    const { rerender } = render(<CommanderPanel {...props} locale="en" />);
    expect(screen.getByRole('region', { name: 'Amirs and commanders' })).toHaveAttribute(
      'dir',
      'ltr',
    );
    expect(screen.getByText('Amir of ten · Cavalry commander')).toBeVisible();
    expect(screen.getByText('Maximum level reached')).toBeVisible();
    expect(screen.getByText(/Recruitment cost:/)).toHaveTextContent('Wood');
    rerender(
      <CommanderPanel
        {...props}
        view={{ ...view, config: { ...view.config, commanders: undefined } }}
      />,
    );
    expect(screen.getByText(/إدارة الأمراء غير متاحة/)).toBeVisible();
    expect(screen.queryByLabelText('اسم القائد')).not.toBeInTheDocument();
  });
  it('rejects whitespace-only names without sending a command and exposes an inline error', () => {
    const view = fixture();
    const send = vi.fn();
    render(<CommanderPanel view={view} village={view.villages[0]} busy={false} send={send} />);
    fireEvent.change(screen.getByLabelText('اسم القائد'), { target: { value: '   ' } });
    fireEvent.submit(screen.getByLabelText('اسم القائد').closest('form')!);
    expect(send).not.toHaveBeenCalled();
    expect(screen.getByLabelText('اسم القائد')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/اكتب اسمًا من حرفين/)).toBeVisible();
  });
  it('integrates commanders into the existing army panel', () => {
    const view = fixture();
    render(<ArmyPanel view={view} village={view.villages[0]} busy={false} send={vi.fn()} />);
    expect(screen.getByRole('region', { name: 'الأمراء والقادة' })).toBeVisible();
    expect(screen.getByRole('heading', { name: /حارس/ })).toBeVisible();
  });
});

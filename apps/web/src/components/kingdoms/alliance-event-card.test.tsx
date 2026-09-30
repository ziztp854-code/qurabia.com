import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import type { AllianceEventView } from '@/lib/kingdoms/types';
import { AllianceEventCard } from './alliance-event-card';
import { AlliancePanel } from './social-panel';
import { KingdomOverview } from './kingdom-overview';
import type { GameProps, WorldView } from './shared';

const now = 1800000000000;
function fixture(overrides: Partial<AllianceEventView> = {}): GameProps {
  const world = executeCommand(
    createWorld(now),
    'player-1',
    { type: 'found', name: 'مملكة النور' },
    now,
  );
  const base: WorldView = {
    ...projectWorld(world, 'player-1', now),
    worldId: 'world-1',
    worldName: 'عالم الاختبار',
    revision: 0,
    paused: false,
  };
  const event: AllianceEventView = {
    eventKey: 's1-w0',
    week: 0,
    theme: 'build',
    title: 'ميثاق البنّائين',
    description: 'أكمل تطوير المباني مع أعضاء تحالفك.',
    startsAt: now,
    endsAt: now + 7 * 86400000,
    target: 30,
    memberCap: 20,
    allianceId: 'alliance-1',
    points: 10,
    ownPoints: 5,
    claimed: false,
    lockedToOtherAlliance: false,
    canClaim: false,
    reward: { wood: 100, stone: 100, iron: 100, food: 100, gold: 20 },
    contributors: [
      { id: 'player-1', name: 'مملكة النور', points: 5 },
      { id: 'player-2', name: 'مملكة الوادي', points: 5 },
    ],
    ...overrides,
  };
  const view = {
    ...base,
    player: { ...base.player!, allianceId: 'alliance-1' },
    allianceEvent: event,
  };
  return {
    view,
    village: { ...view.villages[0], name: 'قرية النور' },
    busy: false,
    send: vi.fn().mockResolvedValue(undefined),
  };
}

afterEach(cleanup);

describe('weekly alliance event', () => {
  it('shows server progress, deadline, reward, personal cap and real contributors', () => {
    const props = fixture();
    render(<AllianceEventCard {...props} />);
    expect(screen.getByRole('heading', { name: 'ميثاق البنّائين' })).toBeVisible();
    const progress = screen.getByRole('progressbar', { name: 'تقدّم التحالف في الميثاق' });
    expect(progress).toHaveAttribute('value', '10');
    expect(progress).toHaveAttribute('max', '30');
    expect(screen.getByText(/مساهمتك: ٥ من ٢٠ نقطة/)).toBeVisible();
    expect(screen.getByText('مملكة الوادي')).toBeVisible();
    expect(screen.getByText(/قرية النور/)).toBeVisible();
    expect(screen.getByText(/١٠٠ خشب/)).toBeVisible();
    expect(document.querySelector('time')).toHaveAttribute(
      'dateTime',
      new Date(props.view.allianceEvent!.endsAt).toISOString(),
    );
    expect(screen.getByRole('button', { name: 'استلم مكافأة الميثاق' })).toBeDisabled();
  });

  it('claims only the server event key into the selected village without optimistic success', () => {
    const props = fixture({ points: 30, ownPoints: 15, canClaim: true });
    render(<AllianceEventCard {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'استلم مكافأة الميثاق' }));
    expect(props.send).toHaveBeenCalledWith({
      type: 'allianceEventClaim',
      villageId: props.village.id,
      eventKey: props.view.allianceEvent!.eventKey,
    });
    expect(screen.queryByText('استلمت مكافأة هذا الميثاق.')).not.toBeInTheDocument();
  });

  it('directs unaffiliated players to the existing membership controls', () => {
    const props = fixture({ allianceId: undefined, points: 0, ownPoints: 0, contributors: [] });
    render(
      <AlliancePanel
        {...props}
        view={{ ...props.view, player: { ...props.view.player!, allianceId: undefined } }}
      />,
    );
    expect(screen.getByText(/أنشئ تحالفًا أو اطلب الانضمام من اللوحة أدناه/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'أنشئ التحالف' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'استلم مكافأة الميثاق' })).toBeDisabled();
  });

  it.each([
    [{ claimed: true, canClaim: false }, 'استلمت مكافأة هذا الميثاق.'],
    [
      { lockedToOtherAlliance: true, canClaim: false },
      'مساهمتك لهذا الأسبوع مرتبطة بتحالفك السابق.',
    ],
    [
      { points: 30, ownPoints: 0, canClaim: false },
      'ساهم بنقطة واحدة على الأقل لاستحقاق المكافأة.',
    ],
  ] as const)('shows a clear reason for an unavailable reward: %s', (state, reason) => {
    render(<AllianceEventCard {...fixture(state)} />);
    expect(screen.getByText(reason)).toBeVisible();
    expect(screen.getByRole('button', { name: 'استلم مكافأة الميثاق' })).toBeDisabled();
  });

  it('blocks rewards in ended or paused worlds even if an old view says eligible', () => {
    const props = fixture({ points: 30, canClaim: true });
    const { rerender } = render(
      <AllianceEventCard
        {...props}
        view={{ ...props.view, serverNow: props.view.allianceEvent!.endsAt }}
      />,
    );
    expect(screen.getByText('انتهى وقت هذا الميثاق.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'استلم مكافأة الميثاق' })).toBeDisabled();
    rerender(<AllianceEventCard {...props} view={{ ...props.view, paused: true }} />);
    expect(screen.getByText('العالم متوقف مؤقتًا.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'استلم مكافأة الميثاق' })).toBeDisabled();
  });

  it('keeps eligible rewards unclaimed when the selected village has no capacity', () => {
    const props = fixture({ points: 30, canClaim: true });
    render(
      <AllianceEventCard
        {...props}
        village={{
          ...props.village,
          resources: { wood: 1e6, stone: 1e6, iron: 1e6, food: 1e6, gold: 1e6 },
        }}
      />,
    );
    expect(screen.getByText(/لا تتسع مخازن قرية النور للمكافأة/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'استلم مكافأة الميثاق' }));
    expect(props.send).not.toHaveBeenCalled();
  });

  it('shows loading while busy and waits for the server to report a claim', () => {
    const props = fixture({ points: 30, canClaim: true });
    const { rerender } = render(<AllianceEventCard {...props} busy />);
    expect(screen.getByRole('button', { name: 'استلم مكافأة الميثاق' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.getByRole('button', { name: 'استلم مكافأة الميثاق' })).toBeDisabled();
    rerender(<AllianceEventCard {...fixture({ claimed: true })} />);
    expect(screen.getByText('استلمت مكافأة هذا الميثاق.')).toBeVisible();
  });

  it('preserves alliance management with older views that contain no event', () => {
    const props = fixture();
    render(<AlliancePanel {...props} view={{ ...props.view, allianceEvent: undefined }} />);
    expect(
      screen.queryByRole('region', { name: 'الميثاق الأسبوعي للتحالف' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'أنشئ التحالف' })).toBeVisible();
  });

  it('opens the real alliance panel from the overview weekly invitation', () => {
    const props = fixture();
    const onNavigate = vi.fn();
    render(
      <KingdomOverview
        view={props.view}
        village={props.village}
        onNavigate={onNavigate}
        onOpenMap={vi.fn()}
        onSelectBuilding={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'افتح الميثاق الأسبوعي' }));
    expect(onNavigate).toHaveBeenCalledWith('alliances');
    expect(screen.getByText(/ميثاق البنّائين · ١٠ من ٣٠ نقطة/)).toBeVisible();
  });
  it('shows all earned points while capping the progress bar at the group target', () => {
    render(<AllianceEventCard {...fixture({ points: 45 })} />);
    expect(screen.getByRole('progressbar', { name: 'تقدّم التحالف في الميثاق' })).toHaveAttribute(
      'value',
      '30',
    );
    expect(screen.getByText(/٤٥ \/ ٣٠/)).toBeVisible();
    expect(screen.getByText(/الأسبوع ١/)).toBeVisible();
  });
});

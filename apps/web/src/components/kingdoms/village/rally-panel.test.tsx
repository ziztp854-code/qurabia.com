import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import type { IncomingMovementView } from '@/lib/kingdoms/types';
import type { WorldView } from '../shared';
import { RallyPanel } from './rally-panel';

const now = 1_800_000_000_000;

function fixture() {
  const view = {
    ...projectWorld(
      executeCommand(createWorld(now), 'player', { type: 'found', name: 'اختبار' }, now),
      'player',
      now,
    ),
    worldId: 'world',
    worldName: 'عالم',
    revision: 0,
    paused: false,
  } satisfies WorldView;
  return view;
}

afterEach(cleanup);

describe('RallyPanel', () => {
  it('opens campaign missions through the existing flow and hides enemy composition', async () => {
    const user = userEvent.setup();
    const view = fixture();
    const village = view.villages[0];
    const onCampaign = vi.fn();
    const onOpenTraining = vi.fn();
    const incoming = {
      id: 'hit',
      mission: 'scout' as const,
      targetVillageId: village.id,
      arrivesAt: now + 80_000,
      source: {
        id: 'src',
        name: 'معسكر العدو',
        x: 4,
        y: 4,
        kingdomName: 'عدو',
        ownerId: 'bob',
        protectedUntil: 0,
      },
      troops: { guard: 7777, rider: 1, scout: 1, settler: 1 },
      commanderId: 'secret-commander',
      combatPower: 8888,
      loot: { gold: 99999 },
    };
    render(
      <RallyPanel
        view={{ ...view, incoming: [incoming as IncomingMovementView] }}
        village={{
          ...village,
          troops: { guard: 6, rider: 0, scout: 0, settler: 0 },
        }}
        busy={false}
        send={vi.fn()}
        onClose={vi.fn()}
        onCampaign={onCampaign}
        onOpenTraining={onOpenTraining}
      />,
    );
    const panel = screen.getByRole('region', { name: 'نقطة تجمع الجيوش' });
    expect(panel).toHaveAttribute('data-readiness', 'ready');
    expect(panel).toHaveTextContent('استطلاع قادم');
    expect(panel).not.toHaveTextContent('7777');
    expect(panel).not.toHaveTextContent('secret-commander');
    expect(panel).not.toHaveTextContent('8888');
    expect(panel).not.toHaveTextContent('99999');
    await user.click(screen.getByRole('button', { name: 'استطلاع' }));
    expect(onCampaign).toHaveBeenCalledWith('scout');
    await user.click(screen.getByRole('button', { name: 'إرسال جيش' }));
    expect(onCampaign).toHaveBeenCalledWith('attack');
    await user.click(screen.getByRole('button', { name: 'إرسال تعزيزات' }));
    expect(onCampaign).toHaveBeenCalledWith('reinforce');
    await user.click(screen.getByRole('button', { name: 'الذهاب إلى التدريب' }));
    expect(onOpenTraining).toHaveBeenCalledWith('barracks');
  });

  it('closes from the keyboard and keeps the heading focused', () => {
    const view = fixture();
    const onClose = vi.fn();
    render(
      <RallyPanel
        view={view}
        village={view.villages[0]}
        busy={false}
        send={vi.fn()}
        onClose={onClose}
      />,
    );
    expect(screen.getByRole('heading', { name: 'نقطة تجمع الجيوش' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('region', { name: 'نقطة تجمع الجيوش' }), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

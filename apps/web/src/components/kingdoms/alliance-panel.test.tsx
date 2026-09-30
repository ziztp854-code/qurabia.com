import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import { AlliancePanel } from './social-panel';
import type { WorldView } from './shared';

const now = 1800000000000;
const state = executeCommand(
  createWorld(now),
  'player-1',
  { type: 'found', name: 'مملكة الاختبار' },
  now,
);
const view = (): WorldView => ({
  ...projectWorld(state, 'player-1', now),
  worldId: 'world-1',
  worldName: 'عالم الاختبار',
  paused: false,
  revision: 0,
});
afterEach(cleanup);

describe('alliance admission and management', () => {
  it('shows pending admission without claiming membership or resending the request', () => {
    const data = view();
    const send = vi.fn().mockResolvedValue(undefined);
    render(
      <AlliancePanel
        view={{
          ...data,
          alliances: [
            {
              id: 'a1',
              name: 'تحالف الاختبار',
              members: { leader: 'leader' },
              diplomacy: {},
              pending: ['player-1'],
            },
          ],
        }}
        village={data.villages[0]}
        busy={false}
        send={send}
      />,
    );
    expect(screen.getByRole('button', { name: 'طلبك بانتظار الموافقة' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'غادر التحالف' })).not.toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
  });

  it('lets an officer approve and reject applicants and remove members only', () => {
    const data = view();
    const send = vi.fn().mockResolvedValue(undefined);
    render(
      <AlliancePanel
        view={{
          ...data,
          player: { ...data.player!, allianceId: 'a1' },
          alliances: [
            {
              id: 'a1',
              name: 'تحالف الاختبار',
              members: {
                leader: 'leader',
                'player-1': 'officer',
                officer: 'officer',
                member: 'member',
              },
              diplomacy: {},
              pending: ['applicant'],
            },
          ],
        }}
        village={data.villages[0]}
        busy={false}
        send={send}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'اقبل الطلب' }));
    expect(send).toHaveBeenCalledWith({ type: 'allianceApprove', playerId: 'applicant' });
    fireEvent.click(screen.getByRole('button', { name: 'ارفض الطلب' }));
    expect(send).toHaveBeenCalledWith({ type: 'allianceReject', playerId: 'applicant' });
    expect(screen.getAllByRole('button', { name: 'أخرج العضو' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'أخرج العضو' }));
    expect(send).toHaveBeenCalledWith({ type: 'allianceKick', playerId: 'member' });
  });
});

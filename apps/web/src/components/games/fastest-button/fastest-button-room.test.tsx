import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FastestButtonSnapshot } from '@tahaddi/contracts';
import { FastestLeaderboard } from './fastest-button-room';
const fixture: FastestButtonSnapshot = {
  code: '012345',
  revision: 1,
  serverNow: 1000,
  settings: { mode: 'classic', totalRounds: 2, responseSeconds: 10, countdownSeconds: 3 },
  phase: 'results',
  players: [
    { id: 'second', name: 'سلطان', score: 0, connected: true, eliminated: false, removed: false },
    { id: 'first', name: 'ليان', score: 0, connected: true, eliminated: false, removed: false },
  ],
  round: {
    id: 'round',
    number: 1,
    isTiebreak: false,
    isFinal: false,
    eligibleIds: ['first', 'second'],
    startAt: 0,
    endAt: 10000,
    presses: [{ playerId: 'first', sequence: 1, receivedAt: 1000 }],
    winnerId: 'first',
    cancelled: false,
    closedAt: 1000,
    eliminatedIds: [],
    awards: [],
  },
  rounds: [],
  championId: null,
  tiebreakIds: [],
  regularCompleted: 0,
  notice: null,
};
describe('Fastest Button ranking presentation', () => {
  it('shows authoritative press order rather than alphabetical names; non-responders have no fabricated rank', () => {
    render(<FastestLeaderboard room={fixture} />);
    const rows = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(within(rows[0]).getByText('ليان', { exact: true })).toBeInTheDocument();
    expect(within(rows[0]).getByText('1', { exact: true })).toBeInTheDocument();
    expect(within(rows[1]).getByText('—', { exact: true })).toBeInTheDocument();
  });
  it('uses cumulative points ranking and shared ranks for tied totals', () => {
    render(
      <FastestLeaderboard
        room={{
          ...fixture,
          settings: { ...fixture.settings, mode: 'points' },
          players: fixture.players.map((p) => ({ ...p, score: 17 })),
        }}
      />,
    );
    const rows = within(screen.getByRole('list')).getAllByRole('listitem');
    for (const row of rows) expect(within(row).getByText('1', { exact: true })).toBeInTheDocument();
    expect(screen.getAllByText('17', { exact: true })).toHaveLength(2);
  });
});

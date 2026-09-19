import { describe, expect, it } from 'vitest';
import { buildMafiaDisplayState } from './display-state';

describe('buildMafiaDisplayState', () => {
  it('projects mafia into a public display/controller snapshot without private roles', () => {
    const snapshot = buildMafiaDisplayState(
      {
        id: 'mafia-1',
        roomCode: 'ABCD23',
        status: 'DAY',
        currentRound: 2,
        phaseEndsAt: '2026-08-12T10:05:00.000Z',
        winner: null,
        chatEnabled: true,
        updatedAt: '2026-08-12T10:00:00.000Z',
        participants: [
          { id: 'p1', displayName: 'سارة', status: 'ALIVE' },
          { id: 'p2', displayName: 'محمد', status: 'ELIMINATED' },
        ],
      },
      new Date('2026-08-12T10:00:01.000Z'),
    );

    expect(snapshot.mode).toBe('mafia');
    expect(snapshot.state.aliveCount).toBe(1);
    expect(snapshot.state.eliminatedCount).toBe(1);
    expect(snapshot.state.players).toEqual([
      { id: 'p1', displayName: 'سارة', status: 'ALIVE' },
      { id: 'p2', displayName: 'محمد', status: 'ELIMINATED' },
    ]);
    expect(JSON.stringify(snapshot)).not.toContain('KILLER');
    expect(snapshot.stateVersion).toBe(new Date('2026-08-12T10:00:00.000Z').getTime());
  });
});

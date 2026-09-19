import { describe, expect, it } from 'vitest';
import {
  DISPLAY_CONTROLLER_EVENTS,
  type DisplayActionPayload,
  type DisplayJoinPayload,
  type DisplayStatePayload,
} from '@tahaddi/contracts';

describe('display controller contract', () => {
  it('keeps one stable event namespace for display, controller, and relay messages', () => {
    expect(Object.values(DISPLAY_CONTROLLER_EVENTS)).toEqual([
      'display:join',
      'display:resume',
      'display:action',
      'display:state',
      'display:error',
    ]);
  });

  it('supports room resume and optimistic action versions without owning game logic', () => {
    const join: DisplayJoinPayload = {
      roomCode: 'ABCD23',
      mode: 'millionaire',
      role: 'controller',
      resumeToken: 'resume-token',
      lastStateVersion: 4,
    };
    const action: DisplayActionPayload<'choose-option', { optionIndex: number }> = {
      roomCode: join.roomCode,
      subjectId: 'player-1',
      actionId: 'action-1',
      action: 'choose-option',
      payload: { optionIndex: 2 },
      expectedStateVersion: join.lastStateVersion,
    };
    const state: DisplayStatePayload<{ currentLevel: number }> = {
      roomCode: join.roomCode,
      mode: join.mode,
      stateVersion: 5,
      serverAt: new Date(0).toISOString(),
      state: { currentLevel: 2 },
    };

    expect(action.expectedStateVersion).toBe(4);
    expect(state.stateVersion).toBeGreaterThan(join.lastStateVersion ?? 0);
  });
});

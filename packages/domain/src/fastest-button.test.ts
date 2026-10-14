import { describe, expect, it } from 'vitest';
import {
  addFastestPlayer,
  cancelFastestRound,
  createFastestRoom,
  finishFastestRound,
  resetFastestRoom,
  startFastestRound,
  tickFastestRoom,
  type FastestMode,
  type FastestRoom,
} from './fastest-button';
function fixture(mode: FastestMode = 'classic', count = 4, rounds = 2) {
  let room = createFastestRoom(
    '012345',
    'host',
    { mode, totalRounds: rounds, responseSeconds: 10, countdownSeconds: 3 },
    0,
  );
  for (let i = 0; i < count; i++)
    room = addFastestPlayer(room, {
      id: `p${i}`,
      name: `لاعب ${i}`,
      score: 0,
      eliminated: false,
      removed: false,
      connections: {},
      tokenHash: 'hash',
    });
  return room;
}
function round(room: FastestRoom, id = 'round1') {
  return tickFastestRoom(startFastestRound(room, id, 1000), 4000);
}
function finish(room: FastestRoom, ids: string[], now = 6000) {
  const presses = ids.map((playerId, i) => ({ playerId, sequence: i + 1, receivedAt: 5000 }));
  return finishFastestRound({ ...room, round: { ...room.round!, presses } }, now);
}
describe('Fastest Button authoritative rules', () => {
  it('keeps leading zeroes, explicit phases and server deadlines', () => {
    const waiting = startFastestRound(fixture(), 'round', 1000);
    expect(waiting.code).toBe('012345');
    expect(waiting.phase).toBe('countdown');
    expect(waiting.round?.startAt).toBe(4000);
    expect(tickFastestRoom(waiting, 3999).phase).toBe('countdown');
    expect(tickFastestRoom(waiting, 4000).phase).toBe('active');
    expect(tickFastestRoom(waiting, 14000).phase).toBe('results');
  });
  it('selects classic winner by atomic sequence, even with equal timestamps', () => {
    const result = finish(round(fixture()), ['p2', 'p0']);
    expect(result.round?.winnerId).toBe('p2');
    expect(result.phase).toBe('results');
    expect(result.players.every((p) => p.score === 0)).toBe(true);
  });
  it('permits classic next rounds in the same room without rejoining', () => {
    const result = finish(round(fixture()), ['p0']);
    const next = startFastestRound(result, 'round2', 20000);
    expect(next.round?.id).toBe('round2');
    expect(next.players).toHaveLength(4);
    expect(next.round?.presses).toEqual([]);
    expect(next.round?.number).toBe(2);
  });
  it('awards 10,7,5,1 and zero for non-responders', () => {
    const result = finish(round(fixture('points', 5)), ['p2', 'p1', 'p4', 'p0']);
    expect(result.players.map((p) => p.score)).toEqual([1, 7, 10, 0, 5]);
    expect(result.regularCompleted).toBe(1);
  });
  it('finalizes each round only once', () => {
    const result = finish(round(fixture('points')), ['p0', 'p1']);
    expect(finishFastestRound(result, 9999)).toBe(result);
  });
  it('announces the overall points winner after configured rounds', () => {
    const result = finish(round(fixture('points', 3, 1)), ['p1', 'p0', 'p2']);
    expect(result.phase).toBe('finished');
    expect(result.championId).toBe('p1');
  });
  it('runs a tiebreak only for tied leaders, without changing totals', () => {
    let room = finish(round(fixture('points', 3, 2)), ['p0', 'p1', 'p2']);
    room = finish(round(room, 'round2'), ['p1', 'p0', 'p2']);
    expect(room.tiebreakIds).toEqual(['p0', 'p1']);
    const tie = round(room, 'tie');
    expect(tie.round?.isTiebreak).toBe(true);
    expect(tie.round?.eligibleIds).toEqual(['p0', 'p1']);
    const result = finish(tie, ['p1']);
    expect(result.championId).toBe('p1');
    expect(result.players.map((p) => p.score)).toEqual([17, 17, 10]);
  });
  it('retries unanswered tiebreaks with the same contenders', () => {
    const room = finish(round(fixture('points', 2, 1)), []);
    expect(room.tiebreakIds).toEqual(['p0', 'p1']);
    const result = finish(round(room, 'tie'), []);
    expect(result.phase).toBe('results');
    expect(result.tiebreakIds).toEqual(['p0', 'p1']);
    expect(result.championId).toBeNull();
  });
  it('eliminates the last press when everyone responds', () => {
    const room = finish(round(fixture('elimination')), ['p1', 'p2', 'p0', 'p3']);
    expect(room.round?.eliminatedIds).toEqual(['p3']);
    expect(room.players[3].eliminated).toBe(true);
  });
  it('eliminates all non-responders, including disconnected players', () => {
    const result = finish(round(fixture('elimination')), ['p0', 'p2']);
    expect(result.round?.eliminatedIds).toEqual(['p1', 'p3']);
    const final = round(result, 'final');
    expect(final.round?.isFinal).toBe(true);
    expect(final.round?.eligibleIds).toEqual(['p0', 'p2']);
    const champion = finish(final, ['p2', 'p0']);
    expect(champion.championId).toBe('p2');
    expect(champion.phase).toBe('finished');
  });
  it('declares the sole responder champion without eliminating everyone', () => {
    const room = finish(round(fixture('elimination')), ['p2']);
    expect(room.championId).toBe('p2');
    expect(room.players.filter((p) => !p.eliminated)).toHaveLength(1);
  });
  it('replays an all-missed elimination round without a champion or elimination', () => {
    const room = finish(round(fixture('elimination')), []);
    expect(room.round?.cancelled).toBe(true);
    expect(room.players.every((p) => !p.eliminated)).toBe(true);
    expect(room.championId).toBeNull();
    expect(round(room, 'replay').round?.eligibleIds).toHaveLength(4);
  });
  it('host cancellation never awards points or eliminates players', () => {
    for (const mode of ['points', 'elimination'] as const) {
      const room = cancelFastestRound(round(fixture(mode)), 5000);
      expect(room.round?.cancelled).toBe(true);
      expect(room.regularCompleted).toBe(0);
      expect(room.players.every((p) => !p.eliminated && p.score === 0)).toBe(true);
    }
  });
  it('rejects late joins, duplicate names, insufficient players and overlapping rounds', () => {
    expect(() => startFastestRound(fixture('elimination', 1), 'round', 0)).toThrow('لاعبان');
    const room = fixture();
    expect(() => addFastestPlayer(room, { ...room.players[0], id: 'other' })).toThrow('الاسم');
    expect(() =>
      addFastestPlayer(round(room), { ...room.players[0], id: 'other', name: 'متأخر' }),
    ).toThrow('بدأت');
    expect(() => startFastestRound(round(room), 'overlap', 0)).toThrow('لا يمكن');
  });
  it('reset preserves player identities while clearing competition state', () => {
    const result = finish(round(fixture('points', 2, 1)), ['p0', 'p1']);
    const reset = resetFastestRoom(result);
    expect(reset.phase).toBe('lobby');
    expect(reset.rounds).toEqual([]);
    expect(reset.players.map((p) => p.id)).toEqual(['p0', 'p1']);
    expect(reset.players.every((p) => p.score === 0)).toBe(true);
    expect(() => resetFastestRoom(round(fixture()))).toThrow('أوقف');
  });
});

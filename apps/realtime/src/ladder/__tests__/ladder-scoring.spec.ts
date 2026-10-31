import { scoreLadderAnswer, resolveLadderWinner } from '../ladder-scoring.js';

describe('ladder scoring', () => {
  it('rewards difficulty and faster correct answers', () => {
    expect(scoreLadderAnswer('EASY', true, 0, 30000)).toBe(1200);
    expect(scoreLadderAnswer('HARD', true, 15000, 30000)).toBe(2100);
    expect(scoreLadderAnswer('HARD', true, 30000, 30000)).toBe(1800);
    expect(scoreLadderAnswer('MEDIUM', false, 0, 30000)).toBe(-300);
  });
  it('shows the bounded effect of 200 ms additional network delay', () => {
    const fast = scoreLadderAnswer('EASY', true, 2000, 20000);
    const delayed = scoreLadderAnswer('EASY', true, 2200, 20000);
    expect(fast - delayed).toBe(6);
  });
  it('uses correct-answer time then invokes a lottery only for a complete tie', () => {
    const lottery = jest.fn(() => 'left' as const);
    expect(
      resolveLadderWinner(5, 5, 7000, 7000, 1000, 1200, 1, 1, lottery),
    ).toEqual({ winner: 'right', winnerMethod: 'time' });
    expect(lottery).not.toHaveBeenCalled();
    expect(
      resolveLadderWinner(5, 5, 7000, 7000, 1000, 1000, 1, 1, lottery),
    ).toEqual({ winner: 'left', winnerMethod: 'lottery' });
    expect(lottery).toHaveBeenCalledTimes(1);
    expect(
      resolveLadderWinner(5, 5, 7000, 7000, 2000, 1500, 2, 1, lottery),
    ).toEqual({ winner: 'right', winnerMethod: 'time' });
    expect(resolveLadderWinner(0, 0, 0, 0, 0, 1000, 0, 1, lottery)).toEqual({
      winner: 'left',
      winnerMethod: 'time',
    });
  });
  it('selects position before points', () => {
    const lottery = () => 'left' as const;
    expect(resolveLadderWinner(5, 4, 0, 9000, 0, 0, 0, 0, lottery)).toEqual({
      winner: 'right',
      winnerMethod: 'position',
    });
    expect(resolveLadderWinner(5, 5, 7000, 6000, 0, 0, 0, 0, lottery)).toEqual({
      winner: 'right',
      winnerMethod: 'score',
    });
  });
});

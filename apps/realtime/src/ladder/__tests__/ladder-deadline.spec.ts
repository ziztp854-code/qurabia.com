import { LadderGateway } from '../ladder.gateway.js';
import type { LadderRoomRuntime } from '../ladder.types.js';

describe('ladder deadline recovery', () => {
  afterEach(() => jest.restoreAllMocks());
  it('waits for the same 250 ms grace on sync before expiring a question', async () => {
    const room = {
      roomCode: 'AB12CD34',
      status: 'active',
      currentQuestionId: 'q1',
      questionDeadlineAt: 1000,
    } as LadderRoomRuntime;
    const expireQuestion = jest
      .fn()
      .mockResolvedValue({ ok: true, room: { ...room, roundResult: {} } });
    const gateway = new LadderGateway(
      { expireQuestion } as never,
      {} as never,
      {} as never,
    );
    const refresh = (
      gateway as unknown as {
        refreshExpiredRoom: (
          value: LadderRoomRuntime,
        ) => Promise<LadderRoomRuntime>;
      }
    ).refreshExpiredRoom.bind(gateway);
    const clock = jest.spyOn(Date, 'now').mockReturnValue(1249);
    expect(await refresh(room)).toBe(room);
    expect(expireQuestion).not.toHaveBeenCalled();
    clock.mockReturnValue(1250);
    await refresh(room);
    expect(expireQuestion).toHaveBeenCalledWith(room.roomCode, 'q1');
  });
  it('retries startup recovery after Redis failure and cancels retries on shutdown', async () => {
    jest.useFakeTimers();
    const list = jest
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ cursor: '0', codes: [] });
    const gateway = new LadderGateway(
      {} as never,
      { listActiveLadderRoomCodes: list } as never,
      {} as never,
    );
    gateway.afterInit();
    await Promise.resolve();
    await Promise.resolve();
    expect(list).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(2000);
    expect(list).toHaveBeenCalledTimes(2);
    gateway.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(4000);
    expect(list).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it('cancels a pending recovery retry when shut down', async () => {
    jest.useFakeTimers();
    const list = jest.fn().mockRejectedValue(new Error('offline'));
    const gateway = new LadderGateway(
      {} as never,
      { listActiveLadderRoomCodes: list } as never,
      {} as never,
    );
    gateway.afterInit();
    await Promise.resolve();
    await Promise.resolve();
    gateway.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(4000);
    expect(list).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});

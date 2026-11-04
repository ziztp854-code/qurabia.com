import { LadderGateway } from '../ladder.gateway.js';
import type { LadderRoomRuntime } from '../ladder.types.js';

describe('ladder deadline recovery', () => {
  afterEach(() => jest.restoreAllMocks());
  it('restores a persisted intro timer after restart and opens only at its deadline', async () => {
    jest.useFakeTimers({ now: 100_000 });
    const room = {
      roomCode: 'AB12CD34',
      status: 'intro',
      introStartedAt: 100_000,
      introEndsAt: 109_775,
      revision: 1,
    } as LadderRoomRuntime;
    const completeIntro = jest.fn().mockResolvedValue({
      ok: true,
      room: { ...room, status: 'active', revision: 2 },
    });
    const gateway = new LadderGateway(
      { getRoom: jest.fn().mockResolvedValue(room), completeIntro } as never,
      {
        listActiveLadderRoomCodes: jest
          .fn()
          .mockResolvedValue({ cursor: '0', codes: [room.roomCode] }),
      } as never,
      {} as never,
    );
    gateway.server = {
      on: jest.fn(),
      off: jest.fn(),
      serverSideEmit: jest.fn(),
    } as never;
    try {
      gateway.afterInit();
      await jest.advanceTimersByTimeAsync(9774);
      expect(completeIntro).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);
      expect(completeIntro).toHaveBeenCalledTimes(1);
      expect(completeIntro).toHaveBeenCalledWith(room.roomCode, 100_000);
    } finally {
      gateway.onModuleDestroy();
      jest.useRealTimers();
    }
  });

  it('finishes an elapsed intro during state refresh without replaying it', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(110_000);
    const room = {
      roomCode: 'AB12CD34',
      status: 'intro',
      introStartedAt: 100_000,
      introEndsAt: 109_775,
    } as LadderRoomRuntime;
    const active = { ...room, status: 'active' } as LadderRoomRuntime;
    const completeIntro = jest
      .fn()
      .mockResolvedValue({ ok: true, room: active });
    const gateway = new LadderGateway(
      { completeIntro } as never,
      {} as never,
      {} as never,
    );
    const refresh = (
      gateway as unknown as {
        refreshExpiredRoom: (
          room: LadderRoomRuntime,
        ) => Promise<LadderRoomRuntime>;
      }
    ).refreshExpiredRoom.bind(gateway);
    expect(await refresh(room)).toBe(active);
    expect(completeIntro).toHaveBeenCalledWith(room.roomCode, 100_000);
  });

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

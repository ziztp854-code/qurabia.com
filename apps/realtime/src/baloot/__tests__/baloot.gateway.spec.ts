import { PATH_METADATA } from '@nestjs/common/constants';
import { GATEWAY_OPTIONS } from '@nestjs/websockets/constants';
import type { Server } from 'socket.io';
import { BALOOT_RULES } from '@tahaddi/domain';
import { BalootGateway } from '../baloot.gateway.js';
import { BalootService } from '../baloot.service.js';

type TestBalootSocket = Parameters<BalootGateway['createRoom']>[0];

describe('BalootGateway', () => {
  const busy = { ok: false as const, code: 'ROOM_BUSY', message: 'busy' };

  it('acknowledges a busy player command without broadcasting or retrying it', async () => {
    const setReady = jest.fn().mockResolvedValue(busy);
    const gateway = new BalootGateway({ setReady } as unknown as BalootService);
    const client = {
      id: 'busy-ready',
      data: { balootRoomCode: '123456', balootSessionToken: 'token' },
    } as unknown as TestBalootSocket;
    expect(await gateway.ready(client, { ready: true })).toEqual(busy);
    expect(setReady).toHaveBeenCalledTimes(1);
  });

  it('keeps a newer turn timer when an older timeout completes as busy', async () => {
    jest.useFakeTimers();
    try {
      let complete!: (result: typeof busy) => void;
      const playTimedOutTurn = jest
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              complete = resolve;
            }),
        )
        .mockResolvedValue(false);
      const gateway = new BalootGateway({
        playTimedOutTurn,
      } as unknown as BalootService);
      const scheduler = gateway as unknown as {
        scheduleTurnTimeout: (code: string, snapshot: unknown) => void;
      };
      scheduler.scheduleTurnTimeout('123456', {
        phase: 'PLAYING',
        turn: 2,
        stateVersion: 9,
      });
      await jest.advanceTimersByTimeAsync(BALOOT_RULES.turnTimeoutMs);
      scheduler.scheduleTurnTimeout('123456', {
        phase: 'PLAYING',
        turn: 3,
        stateVersion: 10,
      });
      complete(busy);
      await jest.advanceTimersByTimeAsync(1_000);
      expect(playTimedOutTurn).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(BALOOT_RULES.turnTimeoutMs - 1_000);
      expect(playTimedOutTurn).toHaveBeenLastCalledWith('123456', 10, 3);
    } finally {
      jest.useRealTimers();
    }
  });

  it('retains the socket identity and returns busy when leaving cannot acquire the lock', async () => {
    const leave = jest.fn().mockResolvedValue(busy);
    const service = {
      leave,
    } as unknown as BalootService;
    const gateway = new BalootGateway(service);
    const socketLeave = jest.fn();
    const client = {
      id: 'busy-socket',
      data: { balootRoomCode: '123456', balootSessionToken: 'token' },
      leave: socketLeave,
    } as unknown as TestBalootSocket;
    expect(await gateway.leave(client, {})).toEqual(busy);
    expect(client.data.balootSessionToken).toBe('token');
    expect(socketLeave).not.toHaveBeenCalled();
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('does not attach a different room when detaching the current room is busy', async () => {
    const joinRoom = jest.fn();
    const leave = jest.fn().mockResolvedValue(busy);
    const gateway = new BalootGateway({
      leave,
      joinRoom,
    } as unknown as BalootService);
    const client = {
      id: 'cross-room',
      data: { balootRoomCode: '123456', balootSessionToken: 'token' },
    } as unknown as TestBalootSocket;
    expect(
      await gateway.joinRoom(client, {
        roomCode: '654321',
        playerName: 'Guest',
      }),
    ).toEqual(busy);
    expect(joinRoom).not.toHaveBeenCalled();
    expect(client.data.balootRoomCode).toBe('123456');
  });

  it('retries only the guarded automatic timeout when its lock is busy', async () => {
    jest.useFakeTimers();
    try {
      const playTimedOutTurn = jest
        .fn()
        .mockResolvedValueOnce(busy)
        .mockResolvedValue(false);
      const gateway = new BalootGateway({
        playTimedOutTurn,
      } as unknown as BalootService);
      (
        gateway as unknown as {
          scheduleTurnTimeout: (code: string, snapshot: unknown) => void;
        }
      ).scheduleTurnTimeout('123456', {
        phase: 'PLAYING',
        turn: 2,
        stateVersion: 9,
      });
      await jest.advanceTimersByTimeAsync(BALOOT_RULES.turnTimeoutMs);
      expect(playTimedOutTurn).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1_000);
      expect(playTimedOutTurn).toHaveBeenCalledTimes(2);
      expect(playTimedOutTurn).toHaveBeenLastCalledWith('123456', 9, 2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('retries a busy disconnect instead of discarding the pending presence change', async () => {
    jest.useFakeTimers();
    try {
      const disconnect = jest
        .fn()
        .mockResolvedValueOnce(busy)
        .mockResolvedValue(null);
      const service = {
        disconnect,
        listRoomSockets: jest.fn().mockResolvedValue([]),
        getSnapshots: jest.fn().mockResolvedValue(new Map()),
      } as unknown as BalootService;
      const gateway = new BalootGateway(service);
      (
        gateway as unknown as { queueDisconnect: (identity: unknown) => void }
      ).queueDisconnect({ roomCode: '123456', sessionToken: 'token' });
      await jest.advanceTimersByTimeAsync(8_000);
      expect(disconnect).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1_000);
      expect(disconnect).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('invokes the authoritative timeout play with the scheduled state', async () => {
    jest.useFakeTimers();
    try {
      const playTimedOutTurn = jest.fn().mockResolvedValue(false);
      const service = { playTimedOutTurn } as unknown as BalootService;
      const gateway = new BalootGateway(service);

      (
        gateway as unknown as {
          scheduleTurnTimeout: (roomCode: string, snapshot: unknown) => void;
        }
      ).scheduleTurnTimeout('123456', {
        phase: 'PLAYING',
        turn: 2,
        stateVersion: 9,
      });
      await jest.advanceTimersByTimeAsync(BALOOT_RULES.turnTimeoutMs);

      expect(playTimedOutTurn).toHaveBeenCalledWith('123456', 9, 2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('uses the /baloot namespace', () => {
    expect(Reflect.getMetadata(GATEWAY_OPTIONS, BalootGateway)).toMatchObject({
      namespace: '/baloot',
    });
    expect(Reflect.getMetadata(PATH_METADATA, BalootGateway)).toBeUndefined();
  });

  it('rejects malformed payloads before they reach the service', async () => {
    const gateway = new BalootGateway(new BalootService());
    const client = {
      id: 'bad',
      join: jest.fn(),
      data: {},
    } as unknown as TestBalootSocket;

    await expect(
      gateway.createRoom(client, null as never),
    ).resolves.toMatchObject({
      ok: false,
      code: 'INVALID_PAYLOAD',
    });
  });

  it('returns acknowledgement payloads and broadcasts private snapshots', async () => {
    const service = new BalootService();
    const gateway = new BalootGateway(service);
    const emitted: Array<{ target: string; event: string; payload: unknown }> =
      [];
    gateway.server = {
      to: (target: string) => ({
        emit: (event: string, payload: unknown) =>
          emitted.push({ target, event, payload }),
      }),
    } as unknown as Server;
    const host = {
      id: 'host-socket',
      join: jest.fn(),
      data: {},
    };

    const acknowledgement = await gateway.createRoom(host as never, {
      playerName: 'Host',
    });

    expect(acknowledgement.ok).toBe(true);
    if (!acknowledgement.ok) throw new Error('room creation failed');
    expect(typeof acknowledgement.data.roomCode).toBe('string');
    expect(host.join).toHaveBeenCalledWith(expect.any(String));
    const stateEvent = emitted.find(
      (event) =>
        event.target === 'host-socket' && event.event === 'baloot:state',
    );
    expect(stateEvent?.payload).toMatchObject({ yourSeat: 0, yourHand: [] });
  });

  it('reconnects from a session token without trusting a claimed seat', async () => {
    const service = new BalootService();
    const created = await service.createRoom({ playerName: 'Host' });
    if (!created.ok) throw new Error('room creation failed');
    const gateway = new BalootGateway(service);
    gateway.server = {
      to: jest.fn(() => ({ emit: jest.fn() })),
    } as unknown as Server;
    const client = {
      id: 'new-socket',
      join: jest.fn(),
      data: {},
    } as unknown as TestBalootSocket;

    const reconnectPayload = {
      sessionToken: created.data.sessionToken,
      seat: 3,
    };
    const acknowledgement = await gateway.reconnect(client, reconnectPayload);

    expect(acknowledgement).toMatchObject({
      ok: true,
      data: { snapshot: { yourSeat: 0 } },
    });
  });

  it('returns bid and play-card acknowledgements with command versions', async () => {
    const service = new BalootService();
    const gateway = new BalootGateway(service);
    gateway.server = {
      to: jest.fn(() => ({ emit: jest.fn() })),
    } as unknown as Server;
    const clients = ['host', 'two', 'three', 'four'].map(
      (id) =>
        ({ id, join: jest.fn(), data: {} }) as unknown as TestBalootSocket,
    );
    const hosted = await gateway.createRoom(clients[0], { playerName: 'Host' });
    if (!hosted.ok) throw new Error('host failed');
    const sessionTokens: string[] = [hosted.data.sessionToken];
    for (let index = 1; index < clients.length; index += 1) {
      const joined = await gateway.joinRoom(clients[index], {
        roomCode: hosted.data.roomCode,
        playerName: `Player ${index}`,
      });
      if (!joined.ok) throw new Error('join failed');
      sessionTokens.push(joined.data.sessionToken);
    }
    for (const client of clients) await gateway.ready(client, { ready: true });
    const started = await gateway.start(clients[0], {});
    if (!started.ok) throw new Error('start failed');

    const bid = await gateway.bid(clients[0], {
      bid: { mode: 'sun' },
      expectedVersion: started.data.snapshot.stateVersion,
      commandId: 'gateway-bid',
    });
    if (!bid.ok) throw new Error('bid failed');
    // The other three players must pass to close the auction.
    for (let seat = 1; seat < 4; seat += 1) {
      const seatSnapshot = (await service.getSnapshot(
        hosted.data.roomCode,
        sessionTokens[seat],
      ))!;
      const next = await gateway.bid(clients[seat], {
        bid: { mode: 'pass' },
        expectedVersion: seatSnapshot.stateVersion,
        commandId: `gateway-pass-${seat}`,
      });
      if (!next.ok) throw new Error(`pass ${seat} failed: ${next.code}`);
    }
    // Seat 1 accepts the settled contract — PLAYING begins.
    const seatOneSnapshot = (await service.getSnapshot(
      hosted.data.roomCode,
      sessionTokens[1],
    ))!;
    const doubler = await gateway.bid(clients[1], {
      bid: { mode: 'accept' },
      expectedVersion: seatOneSnapshot.stateVersion,
      commandId: 'gateway-accept',
    });
    if (!doubler.ok) throw new Error('contract acceptance failed');

    const playingSnapshot = (await service.getSnapshot(
      hosted.data.roomCode,
      sessionTokens[0],
    ))!;
    const played = await gateway.playCard(clients[0], {
      card: playingSnapshot.yourHand[0],
      expectedVersion: playingSnapshot.stateVersion,
      commandId: 'gateway-play',
    });

    expect(played).toMatchObject({
      ok: true,
      data: { snapshot: { currentTrick: [{ seat: 0 }] } },
    });
  });

  it('keeps a reconnected seat online when its old socket disconnects', async () => {
    const service = new BalootService();
    const gateway = new BalootGateway(service);
    gateway.server = {
      to: jest.fn(() => ({ emit: jest.fn() })),
    } as unknown as Server;
    const oldSocket = {
      id: 'old',
      join: jest.fn(),
      data: {},
    } as unknown as TestBalootSocket;
    const hosted = await gateway.createRoom(oldSocket, { playerName: 'Host' });
    if (!hosted.ok) throw new Error('host failed');
    const newSocket = {
      id: 'new',
      join: jest.fn(),
      data: {},
    } as unknown as TestBalootSocket;
    const reconnected = await gateway.reconnect(newSocket, {
      sessionToken: hosted.data.sessionToken,
    });
    if (!reconnected.ok) throw new Error('reconnect failed');

    await gateway.handleDisconnect(oldSocket);

    expect(reconnected.data.sessionToken).toBe(hosted.data.sessionToken);
    expect(
      (
        await service.getSnapshot(
          hosted.data.roomCode,
          reconnected.data.sessionToken,
        )
      )?.seats[0].connected,
    ).toBe(true);
  });

  it('keeps a second join on the same socket from occupying another seat', async () => {
    const service = new BalootService();
    const gateway = new BalootGateway(service);
    gateway.server = {
      to: jest.fn(() => ({ emit: jest.fn() })),
    } as unknown as Server;
    const client = {
      id: 'same-socket',
      join: jest.fn(),
      leave: jest.fn(),
      data: {},
    } as unknown as TestBalootSocket;
    const hosted = await gateway.createRoom(client, { playerName: 'Host' });
    if (!hosted.ok) throw new Error('host failed');
    const second = await gateway.joinRoom(client, {
      roomCode: hosted.data.roomCode,
      playerName: 'Host Twin',
    });
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error('second join failed');
    expect(second.data.snapshot.yourSeat).toBe(0);
    expect(second.data.snapshot.seats).toHaveLength(1);
  });
});

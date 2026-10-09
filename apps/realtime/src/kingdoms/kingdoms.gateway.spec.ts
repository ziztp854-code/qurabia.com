import type { Namespace, Socket } from 'socket.io';
import { KingdomsGateway } from './kingdoms.gateway.js';

describe('Kingdoms revision notifications', () => {
  const socket = (id = 'socket-1') => {
    const join = jest.fn();
    const leave = jest.fn();
    const client = {
      id,
      rooms: new Set([id]),
      join,
      leave,
    } as unknown as Socket;
    return { client, join, leave };
  };

  it('validates room IDs and permits only one watched world per socket', async () => {
    const gateway = new KingdomsGateway();
    const { client, join, leave } = socket();
    expect(await gateway.watch(client, { worldId: '../invalid' })).toEqual({
      success: false,
    });
    expect(join).not.toHaveBeenCalled();
    client.rooms.add('kingdoms:world:old-world');
    expect(await gateway.watch(client, { worldId: 'world-1' })).toEqual({
      success: true,
      worldId: 'world-1',
      capability: 'revision-push-v1',
      live: false,
      heartbeatIntervalMs: 5_000,
      heartbeatTimeoutMs: 20_000,
    });
    expect(leave).toHaveBeenCalledWith('kingdoms:world:old-world');
    expect(join).toHaveBeenCalledWith('kingdoms:world:world-1');
  });

  it('limits subscriptions and clears the bucket when disconnected', async () => {
    const gateway = new KingdomsGateway();
    const { client } = socket();
    for (let attempt = 0; attempt < 10; attempt++)
      await gateway.watch(client, { worldId: 'world-1' });
    expect(await gateway.watch(client, { worldId: 'world-1' })).toEqual({
      success: false,
    });
    gateway.handleDisconnect(client);
    expect(await gateway.watch(client, { worldId: 'world-1' })).toEqual(
      expect.objectContaining({ success: true, worldId: 'world-1' }),
    );
  });

  it('emits only public revision invalidation with no player information', () => {
    const gateway = new KingdomsGateway();
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    gateway.server = { to } as unknown as Namespace;
    gateway.publishRevision('world-1', 4);
    expect(to).toHaveBeenCalledWith('kingdoms:world:world-1');
    expect(emit).toHaveBeenCalledWith('kingdoms:revision', {
      worldId: 'world-1',
      revision: 4,
    });
    gateway.publishRevision('world-1', -1);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('rejects older and duplicate revisions, even if HTTP delivery is reordered', () => {
    const gateway = new KingdomsGateway();
    const emit = jest.fn();
    gateway.server = { to: () => ({ emit }) } as unknown as Namespace;
    expect(gateway.publishRevision('world-1', 7)).toBe(true);
    expect(gateway.publishRevision('world-1', 6)).toBe(false);
    expect(gateway.publishRevision('world-1', 7)).toBe(false);
    expect(gateway.publishRevision('world-1', 8)).toBe(true);
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenLastCalledWith('kingdoms:revision', {
      worldId: 'world-1',
      revision: 8,
    });
  });

  it('heartbeats only watched rooms while worker health is fresh, without private state', async () => {
    jest.useFakeTimers();
    try {
      const gateway = new KingdomsGateway();
      const { client } = socket();
      const emit = jest.fn();
      gateway.server = { to: () => ({ emit }) } as unknown as Namespace;
      await gateway.watch(client, { worldId: 'world-1' });
      gateway.heartbeat();
      expect(emit).not.toHaveBeenCalled();
      gateway.setWorkerHealth(true);
      expect(await gateway.watch(client, { worldId: 'world-1' })).toEqual(
        expect.objectContaining({ live: true }),
      );
      gateway.heartbeat();
      expect(emit).toHaveBeenLastCalledWith('kingdoms:revision', {
        worldId: 'world-1',
        revision: 0,
      });
      gateway.publishRevision('world-1', 4);
      gateway.heartbeat();
      expect(emit).toHaveBeenLastCalledWith('kingdoms:revision', {
        worldId: 'world-1',
        revision: 4,
      });
      jest.advanceTimersByTime(20_000);
      gateway.heartbeat();
      expect(emit).toHaveBeenCalledTimes(3);
      expect(await gateway.watch(client, { worldId: 'world-1' })).toEqual(
        expect.objectContaining({ live: false }),
      );
      gateway.setWorkerHealth(true);
      gateway.handleDisconnect(client);
      gateway.heartbeat();
      expect(emit).toHaveBeenCalledTimes(3);
    } finally {
      jest.useRealTimers();
    }
  });

  it('retains the latest concurrent subscription and removes a late stale room', async () => {
    const gateway = new KingdomsGateway();
    const { client, join, leave } = socket();
    let finishOld!: () => void;
    join.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishOld = resolve;
        }),
    );
    const old = gateway.watch(client, { worldId: 'old-world' });
    expect(await gateway.watch(client, { worldId: 'new-world' })).toEqual(
      expect.objectContaining({ success: true, worldId: 'new-world' }),
    );
    finishOld();
    expect(await old).toEqual({ success: false });
    expect(leave).toHaveBeenCalledWith('kingdoms:world:old-world');
    const to = jest.fn(() => ({ emit: jest.fn() }));
    gateway.server = { to } as unknown as Namespace;
    gateway.setWorkerHealth(true);
    gateway.heartbeat();
    expect(to).toHaveBeenCalledWith('kingdoms:world:new-world');
    expect(to).not.toHaveBeenCalledWith('kingdoms:world:old-world');
  });

  it('bounds the revision cache rather than accumulating every world forever', async () => {
    const gateway = new KingdomsGateway();
    for (let index = 0; index < 1_025; index++)
      gateway.publishRevision(`world-${index}`, 10);
    const { client } = socket();
    await gateway.watch(client, { worldId: 'world-0' });
    const emit = jest.fn();
    gateway.server = { to: () => ({ emit }) } as unknown as Namespace;
    gateway.setWorkerHealth(true);
    gateway.heartbeat();
    expect(emit).toHaveBeenCalledWith('kingdoms:revision', {
      worldId: 'world-0',
      revision: 0,
    });
    await gateway.watch(client, { worldId: 'world-1024' });
    gateway.heartbeat();
    expect(emit).toHaveBeenLastCalledWith('kingdoms:revision', {
      worldId: 'world-1024',
      revision: 10,
    });
  });

  it('does not leave a newer room added while an older subscription awaits leave', async () => {
    const gateway = new KingdomsGateway();
    const { client, join, leave } = socket();
    client.rooms.add('kingdoms:world:initial');
    let finishOldLeave!: () => void;
    leave
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishOldLeave = resolve;
          }),
      )
      .mockImplementation((room: string) => {
        client.rooms.delete(room);
      });
    join.mockImplementation((room: string) => {
      client.rooms.add(room);
    });
    const old = gateway.watch(client, { worldId: 'old-world' });
    await gateway.watch(client, { worldId: 'new-world' });
    finishOldLeave();
    expect(await old).toEqual({ success: false });
    expect(client.rooms.has('kingdoms:world:new-world')).toBe(true);
    expect(client.rooms.has('kingdoms:world:old-world')).toBe(false);
    expect(leave).not.toHaveBeenCalledWith('kingdoms:world:new-world');
  });

  it('caps unique active worlds, deduplicates subscribers and frees capacity on disconnect', async () => {
    const gateway = new KingdomsGateway();
    const clients: Socket[] = [];
    for (let index = 0; index < 512; index++) {
      const { client } = socket(`socket-${index}`);
      clients.push(client);
      expect(
        await gateway.watch(client, { worldId: `world-${index}` }),
      ).toEqual(expect.objectContaining({ success: true }));
    }
    const sameWorld = socket('same-world-socket');
    expect(
      await gateway.watch(sameWorld.client, { worldId: 'world-1' }),
    ).toEqual(expect.objectContaining({ success: true }));
    expect(gateway.watchedWorldIds()).toHaveLength(512);
    const overflow = socket('overflow-socket');
    expect(
      await gateway.watch(overflow.client, { worldId: 'extra-world' }),
    ).toEqual({ success: false });
    expect(overflow.join).not.toHaveBeenCalled();
    gateway.handleDisconnect(clients[0]);
    expect(
      await gateway.watch(overflow.client, { worldId: 'extra-world' }),
    ).toEqual(expect.objectContaining({ success: true }));
    expect(gateway.watchedWorldIds()).toHaveLength(512);
    expect(gateway.watchedWorldIds()).toContain('extra-world');
  });

  it('preserves a newer pending join to the same world when the older join completes first', async () => {
    const gateway = new KingdomsGateway();
    const { client, join, leave } = socket();
    const finishes: (() => void)[] = [];
    join.mockImplementation((room: string) => {
      client.rooms.add(room);
      return new Promise<void>((resolve) => {
        finishes.push(resolve);
      });
    });
    leave.mockImplementation((room: string) => {
      client.rooms.delete(room);
    });
    const old = gateway.watch(client, { worldId: 'world-1' });
    const current = gateway.watch(client, { worldId: 'world-1' });
    await Promise.resolve();
    finishes[0]();
    expect(await old).toEqual({ success: false });
    expect(client.rooms.has('kingdoms:world:world-1')).toBe(true);
    finishes[1]();
    expect(await current).toEqual(expect.objectContaining({ success: true }));
    expect(client.rooms.has('kingdoms:world:world-1')).toBe(true);
  });
});

import type { Namespace, Socket } from 'socket.io';
import { KingdomsGateway } from './kingdoms.gateway.js';

describe('Kingdoms revision notifications', () => {
  const socket = () => {
    const join = jest.fn();
    const leave = jest.fn();
    const client = {
      id: 'socket-1',
      rooms: new Set(['socket-1']),
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
    expect(await gateway.watch(client, { worldId: 'world-1' })).toEqual({
      success: true,
    });
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
});

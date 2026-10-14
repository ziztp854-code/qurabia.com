/* eslint-disable @typescript-eslint/unbound-method -- Socket methods here are Jest mocks asserted without invocation. */
import { ConfigService } from '@nestjs/config';
import { FastestRuleError } from '@tahaddi/domain';
import { createFastestButtonHostAccessToken } from '@tahaddi/contracts';
import { FastestButtonGateway } from './fastest-button.gateway';
import { FastestButtonService } from './fastest-button.service';
import { RedisService } from '../game/redis.service';
import type { Socket } from 'socket.io';
const secret = 'fastest-button-test-secret-minimum-length';
function socket(id = 's', hostId?: string): Socket {
  return {
    id,
    handshake: {
      address: '127.0.0.1',
      auth: hostId
        ? {
            hostToken: createFastestButtonHostAccessToken(secret, {
              hostId,
              expiresAt: Date.now() + 60000,
            }),
          }
        : {},
    },
    emit: jest.fn(),
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn().mockResolvedValue(undefined),
  } as unknown as Socket;
}
describe('Fastest Button gateway authorization', () => {
  let gateway: FastestButtonGateway;
  const room = {
    code: '012345',
    hostId: 'host',
    players: [],
    phase: 'lobby',
    revision: 0,
    rounds: [],
  };
  const service = {
    create: jest.fn().mockResolvedValue(room),
    get: jest.fn().mockResolvedValue(room),
    join: jest.fn().mockResolvedValue({
      room,
      identity: { code: '012345', playerId: 'player', token: 'a'.repeat(43) },
    }),
    tick: jest.fn().mockResolvedValue(room),
    snapshot: jest.fn().mockReturnValue({ code: '012345', players: [] }),
    clock: jest.fn().mockResolvedValue(1000),
    command: jest.fn().mockResolvedValue(room),
    press: jest.fn().mockResolvedValue(room),
    presence: jest.fn().mockResolvedValue(room),
  };
  beforeEach(() => {
    jest.clearAllMocks();
    service.tick.mockResolvedValue(room);
    service.presence.mockResolvedValue(room);
    service.press.mockResolvedValue(room);
    gateway = new FastestButtonGateway(
      service as unknown as FastestButtonService,
      {
        consumeRateLimit: jest.fn().mockResolvedValue(true),
      } as unknown as RedisService,
      new ConfigService({ AUTH_SECRET: secret }),
    );
    gateway.server = {
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    } as unknown as FastestButtonGateway['server'];
  });
  it('rejects host creation without a signed capability', async () => {
    const client = socket();
    await gateway.create(client, {});
    expect(service.create).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith(
      'fastest:error',
      expect.objectContaining({ code: 'HOST_AUTH_REQUIRED' }),
    );
  });
  it('rejects payload injection of host roles', async () => {
    const client = socket('s', 'host');
    await gateway.create(client, { mode: 'classic', hostId: 'other' });
    expect(service.create).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith(
      'fastest:error',
      expect.objectContaining({ code: 'INVALID_PAYLOAD' }),
    );
  });
  it('never gives display sockets host or player commands, even with a valid host token', async () => {
    const client = socket('display', 'host');
    await gateway.watch(client, { code: '012345' });
    await gateway.command(client, { code: '012345', action: 'start' });
    expect(service.command).not.toHaveBeenCalled();
    await gateway.press(client, {
      code: '012345',
      roundId: '00000000-0000-4000-8000-000000000000',
    });
    expect(service.press).not.toHaveBeenCalled();
  });
  it('binds host control to its attached room and owner', async () => {
    const client = socket('host', 'host');
    await gateway.create(client, {});
    await gateway.command(client, { code: '654321', action: 'start' });
    expect(service.command).not.toHaveBeenCalled();
    await gateway.command(client, { code: '012345', action: 'start' });
    expect(service.command).toHaveBeenCalledWith(
      '012345',
      'host',
      'start',
      undefined,
      undefined,
    );
  });
  it('prevents recovery of another host room', async () => {
    const client = socket('other', 'other');
    await gateway.restoreHost(client, { code: '012345' });
    expect(client.join).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith(
      'fastest:error',
      expect.objectContaining({ code: 'HOST_ONLY' }),
    );
  });
  it('fails closed when the shared Redis rate limiter is unavailable', async () => {
    gateway = new FastestButtonGateway(
      service as unknown as FastestButtonService,
      {
        consumeRateLimit: jest.fn().mockResolvedValue(null),
      } as unknown as RedisService,
      new ConfigService({ AUTH_SECRET: secret }),
    );
    await gateway.create(socket('host', 'host'), {});
    expect(service.create).not.toHaveBeenCalled();
  });
  it('broadcasts deadline results when a heartbeat completes the round before the deadline worker', async () => {
    const client = socket('player');
    await gateway.join(client, { code: '012345', name: 'لاعب' });
    service.presence.mockResolvedValue({ ...room, phase: 'active' });
    service.tick.mockResolvedValue({ ...room, phase: 'results' });
    const broadcasts = jest.fn();
    gateway.server = {
      to: jest.fn().mockReturnValue({ emit: broadcasts }),
    } as unknown as FastestButtonGateway['server'];
    await gateway.sync(client);
    expect(broadcasts).toHaveBeenCalledWith(
      'fastest:state',
      expect.any(Object),
    );
  });
  it('broadcasts a timeout result even when the triggering press is rejected as late', async () => {
    const client = socket('player');
    await gateway.join(client, { code: '012345', name: 'لاعب' });
    service.press.mockRejectedValue(new FastestRuleError('TOO_LATE', 'متأخر'));
    const broadcasts = jest.fn();
    gateway.server = {
      to: jest.fn().mockReturnValue({ emit: broadcasts }),
    } as unknown as FastestButtonGateway['server'];
    await gateway.press(client, {
      code: '012345',
      roundId: '00000000-0000-4000-8000-000000000000',
    });
    expect(broadcasts).toHaveBeenCalledWith(
      'fastest:state',
      expect.any(Object),
    );
    expect(client.emit).toHaveBeenCalledWith(
      'fastest:error',
      expect.objectContaining({ code: 'TOO_LATE' }),
    );
  });
  it('answers an ordinary heartbeat privately instead of broadcasting every participant heartbeat', async () => {
    const client = socket('player');
    await gateway.join(client, { code: '012345', name: 'لاعب' });
    const broadcasts = jest.fn();
    gateway.server = {
      to: jest.fn().mockReturnValue({ emit: broadcasts }),
    } as unknown as FastestButtonGateway['server'];
    await gateway.sync(client);
    expect(broadcasts).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith(
      'fastest:state',
      expect.any(Object),
    );
  });
  it('coalesces concurrent room broadcasts without batching authoritative press recording', async () => {
    const broadcasts = jest.fn();
    gateway.server = {
      to: jest.fn().mockReturnValue({ emit: broadcasts }),
    } as unknown as FastestButtonGateway['server'];
    await Promise.all([
      gateway.join(socket('a'), { code: '012345', name: 'أول' }),
      gateway.join(socket('b'), { code: '012345', name: 'ثان' }),
      gateway.join(socket('c'), { code: '012345', name: 'ثالث' }),
    ]);
    expect(broadcasts).toHaveBeenCalledTimes(1);
  });
});

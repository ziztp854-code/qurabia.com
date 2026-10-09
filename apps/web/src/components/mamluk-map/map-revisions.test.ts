import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { watchMapRevisions, type MapRevisionOptions } from './map-revisions';

const socket = vi.hoisted(() => ({
  connected: false,
  active: true,
  connect: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
}));
vi.mock('socket.io-client', () => ({ io: () => socket }));
const disposers: (() => void)[] = [];
const liveAck = {
  success: true,
  worldId: 'world',
  capability: 'revision-push-v1',
  live: true,
  heartbeatIntervalMs: 5000,
  heartbeatTimeoutMs: 20000,
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  socket.connected = false;
  socket.active = true;
});
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  vi.useRealTimers();
});
function setup(options: MapRevisionOptions = {}) {
  const refresh = vi.fn(),
    onHealth = vi.fn();
  const dispose = watchMapRevisions('world', refresh, { onHealth, ...options });
  disposers.push(dispose);
  const fire = (name: string, event?: unknown) =>
    socket.on.mock.calls.find(([kind]) => kind === name)![1](event);
  const connect = () => {
    socket.connected = true;
    fire('connect');
  };
  const ack = (value: unknown) => socket.emit.mock.calls.at(-1)![2](value);
  return { refresh, onHealth, dispose, fire, connect, ack };
}

it('requires the live ACK and filters revisions against the authorized snapshot while renewing heartbeat health', async () => {
  const { connect, ack, fire, refresh, onHealth, dispose } = setup({ currentRevision: () => '3' });
  connect();
  expect(socket.emit.mock.calls[0]!.slice(0, 2)).toEqual(['kingdoms:watch', { worldId: 'world' }]);
  ack(liveAck);
  expect(onHealth.mock.calls).toEqual([[false], [true]]);
  expect(refresh.mock.calls).toEqual([[]]);
  fire('kingdoms:revision', null);
  fire('kingdoms:revision', { worldId: 'other', revision: 9 });
  fire('kingdoms:revision', { worldId: 'world', revision: -1 });
  fire('kingdoms:revision', { worldId: 'world', revision: 0 });
  fire('kingdoms:revision', { worldId: 'world', revision: 3 });
  fire('kingdoms:revision', { worldId: 'world', revision: 2 });
  expect(refresh).toHaveBeenCalledTimes(1);
  fire('kingdoms:revision', { worldId: 'world', revision: 4 });
  fire('kingdoms:revision', { worldId: 'world', revision: 4 });
  expect(refresh.mock.calls).toEqual([[], [4]]);
  await vi.advanceTimersByTimeAsync(19000);
  fire('kingdoms:revision', { worldId: 'world', revision: 4 });
  await vi.advanceTimersByTimeAsync(19000);
  expect(onHealth).toHaveBeenLastCalledWith(true);
  expect(refresh).toHaveBeenCalledTimes(2);
  dispose();
  dispose();
  fire('kingdoms:revision', { worldId: 'world', revision: 5 });
  await vi.advanceTimersByTimeAsync(60000);
  expect(refresh).toHaveBeenCalledTimes(2);
  expect(socket.disconnect).toHaveBeenCalledOnce();
  expect(socket.off).toHaveBeenCalledTimes(5);
});

it('keeps legacy and live=false ACKs in fallback until a new valid live ACK arrives', async () => {
  const { connect, ack, fire, onHealth, refresh } = setup();
  connect();
  ack({ success: true });
  fire('kingdoms:revision', { worldId: 'world', revision: 1 });
  expect(onHealth.mock.calls).toEqual([[false]]);
  expect(refresh.mock.calls).toEqual([[1]]);
  await vi.advanceTimersByTimeAsync(5000);
  ack({ ...liveAck, live: false });
  fire('kingdoms:revision', { worldId: 'world', revision: 1 });
  expect(onHealth).toHaveBeenLastCalledWith(false);
  await vi.advanceTimersByTimeAsync(10000);
  ack(liveAck);
  expect(onHealth).toHaveBeenLastCalledWith(true);
  expect(refresh.mock.calls).toEqual([[1], []]);
});

it.each([
  { ...liveAck, success: false },
  { ...liveAck, worldId: 'other' },
  { ...liveAck, capability: 'legacy' },
  { ...liveAck, heartbeatTimeoutMs: 1 },
])('rejects an unusable ACK without stopping fallback: %j', (invalid) => {
  const { connect, ack, onHealth, refresh } = setup();
  connect();
  ack(invalid);
  expect(onHealth.mock.calls).toEqual([[false]]);
  expect(refresh).not.toHaveBeenCalled();
});

it('ignores an ACK after its timeout or after a reconnect generation changed', async () => {
  const { connect, ack, fire, refresh, onHealth } = setup();
  connect();
  const oldAck = socket.emit.mock.calls[0]![2];
  await vi.advanceTimersByTimeAsync(5000);
  oldAck(liveAck);
  expect(onHealth).toHaveBeenLastCalledWith(false);
  expect(refresh).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(5000);
  const otherAck = socket.emit.mock.calls.at(-1)![2];
  socket.connected = false;
  fire('disconnect');
  connect();
  otherAck(liveAck);
  expect(refresh).not.toHaveBeenCalled();
  ack(liveAck);
  expect(refresh).toHaveBeenCalledOnce();
  expect(onHealth).toHaveBeenLastCalledWith(true);
});

it('falls back after missing worker heartbeat and recovers on a duplicate with retained live proof', async () => {
  const { connect, ack, fire, refresh, onHealth } = setup({ currentRevision: () => '8' });
  connect();
  ack(liveAck);
  await vi.advanceTimersByTimeAsync(20000);
  expect(onHealth).toHaveBeenLastCalledWith(false);
  fire('kingdoms:revision', { worldId: 'world', revision: 8 });
  expect(onHealth).toHaveBeenLastCalledWith(true);
  await vi.advanceTimersByTimeAsync(5000);
  expect(socket.emit).toHaveBeenCalledTimes(1);
  expect(refresh).toHaveBeenCalledTimes(1);
});

it('drops channel health on connection errors and cancels every owned timer on cleanup', async () => {
  const { connect, ack, fire, onHealth, dispose } = setup();
  connect();
  ack(liveAck);
  fire('error');
  expect(onHealth).toHaveBeenLastCalledWith(false);
  socket.connected = false;
  fire('connect_error');
  dispose();
  await vi.advanceTimersByTimeAsync(60000);
  expect(socket.emit).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('retries a temporarily rejected namespace with bounded delays and cancels reconnect on disposal', async () => {
  const { fire, connect, ack, onHealth, dispose } = setup();
  socket.active = false;
  fire('connect_error');
  await vi.advanceTimersByTimeAsync(4999);
  expect(socket.connect).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(socket.connect).toHaveBeenCalledTimes(1);
  fire('connect_error');
  await vi.advanceTimersByTimeAsync(9999);
  expect(socket.connect).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(socket.connect).toHaveBeenCalledTimes(2);
  socket.active = true;
  connect();
  ack(liveAck);
  expect(onHealth).toHaveBeenLastCalledWith(true);
  socket.connected = false;
  socket.active = false;
  fire('connect_error');
  dispose();
  await vi.advanceTimersByTimeAsync(60000);
  expect(socket.connect).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});

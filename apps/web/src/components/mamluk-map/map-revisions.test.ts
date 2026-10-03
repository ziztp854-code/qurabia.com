import { expect, it, vi } from 'vitest';
import { watchMapRevisions } from './map-revisions';

const socket = vi.hoisted(() => ({ on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }));
vi.mock('socket.io-client', () => ({ io: () => socket }));

it('refetches only valid matching revision notifications and disposes its connection', () => {
  const refresh = vi.fn();
  const dispose = watchMapRevisions('world', refresh);
  const connect = socket.on.mock.calls.find(([name]) => name === 'connect')![1];
  const revision = socket.on.mock.calls.find(([name]) => name === 'kingdoms:revision')![1];
  connect();
  expect(socket.emit).toHaveBeenCalledWith('kingdoms:watch', { worldId: 'world' });
  expect(refresh).toHaveBeenCalledTimes(1);
  revision(null);
  revision({ worldId: 'other', revision: 1 });
  revision({ worldId: 'world', revision: -1 });
  expect(refresh).toHaveBeenCalledTimes(1);
  revision({ worldId: 'world', revision: 3 });
  revision({ worldId: 'world', revision: 3 });
  revision({ worldId: 'world', revision: 2 });
  expect(refresh).toHaveBeenCalledTimes(2);
  dispose();
  revision({ worldId: 'world', revision: 4 });
  expect(refresh).toHaveBeenCalledTimes(2);
  expect(socket.disconnect).toHaveBeenCalledOnce();
});

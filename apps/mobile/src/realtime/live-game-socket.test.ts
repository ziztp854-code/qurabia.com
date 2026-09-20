import assert from 'node:assert/strict';
import test from 'node:test';
import type { LiveConnectionTicket } from '@tahaddi/contracts/client';
import type { LiveGameAction } from './live-game-state';
import { bindLiveGameSocket, liveTicketHeaders, type LiveGameSocketPort } from './live-game-socket';

class FakeEmitter {
  readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  on(event: string, listener: (...args: unknown[]) => void) {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  off(event: string, listener: (...args: unknown[]) => void) {
    this.listeners.get(event)?.delete(listener);
  }

  fire(event: string, ...args: unknown[]) {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }
}

test('every socket reconnect rejoins with the API-issued ticket and receives a fresh snapshot', () => {
  const events = new FakeEmitter();
  const manager = new FakeEmitter();
  const emitted: Array<{ event: string; payload: unknown }> = [];
  const actions: LiveGameAction[] = [];
  const socket: LiveGameSocketPort = {
    connected: false,
    on: events.on.bind(events),
    off: events.off.bind(events),
    emit: (event, payload) => emitted.push({ event, payload }),
    io: { on: manager.on.bind(manager), off: manager.off.bind(manager) },
  };
  const ticket: LiveConnectionTicket = {
    sessionId: 'session-1',
    subjectId: 'player-1',
    role: 'player',
    accessToken: 'signed-ticket',
    expiresAt: Date.now() + 60_000,
  };
  const cleanup = bindLiveGameSocket(socket, ticket, (action) => actions.push(action));

  events.fire('connect');
  manager.fire('reconnect_attempt');
  events.fire('connect');
  events.fire('game:snapshot', {
    sessionId: 'session-1',
    roomCode: 'ABC123',
    phase: 'LOBBY',
    serverTime: 1,
    question: null,
    reveal: null,
    leaderboard: [],
    participantCount: 1,
    playerAnswer: null,
    playerResult: null,
  });
  events.fire('game:host_status', { connected: true });

  assert.deepEqual(emitted, [
    { event: 'game:join', payload: ticket },
    { event: 'game:join', payload: ticket },
  ]);
  assert.equal(actions.filter((action) => action.type === 'socketConnected').length, 2);
  assert.deepEqual(actions.at(-1), {
    type: 'hostStatus',
    payload: { connected: true },
  });

  cleanup();
  events.fire('connect');
  assert.equal(emitted.length, 2);
});

test('native handshake credentials travel in headers and never in the URL', () => {
  const ticket: LiveConnectionTicket = {
    sessionId: 'session-1',
    subjectId: 'player-1',
    role: 'player',
    accessToken: 'signed-ticket',
    expiresAt: 1_800_000_000_000,
  };

  assert.deepEqual(liveTicketHeaders(ticket), {
    'x-tahaddi-live-session-id': 'session-1',
    'x-tahaddi-live-subject-id': 'player-1',
    'x-tahaddi-live-role': 'player',
    'x-tahaddi-live-expires-at': '1800000000000',
    'x-tahaddi-live-token': 'signed-ticket',
  });
});

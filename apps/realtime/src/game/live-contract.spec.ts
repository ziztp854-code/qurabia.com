import {
  isLiveConnectionTicket,
  type LiveConnectionTicket,
} from '../../../../packages/contracts/src/client.js';

describe('client-safe live connection ticket', () => {
  it('accepts the documented ticket issued by the API', () => {
    const ticket: LiveConnectionTicket = {
      sessionId: 'session-1',
      subjectId: 'player-1',
      role: 'player',
      accessToken: 'signed-live-access-token',
      expiresAt: Date.now() + 60_000,
    };

    expect(isLiveConnectionTicket(ticket)).toBe(true);
  });

  it.each([
    null,
    {},
    {
      sessionId: 'session-1',
      subjectId: 'player-1',
      role: 'spectator',
      accessToken: 'token',
    },
    {
      sessionId: '',
      subjectId: 'player-1',
      role: 'player',
      accessToken: 'token',
    },
    {
      sessionId: 'session-1',
      subjectId: 'player-1',
      role: 'player',
      accessToken: '',
    },
    {
      sessionId: 'session-1',
      subjectId: 'player-1',
      role: 'player',
      accessToken: 'token',
      expiresAt: Date.now() - 1,
    },
  ])('rejects an invalid ticket before opening a socket', (value) => {
    expect(isLiveConnectionTicket(value)).toBe(false);
  });
});

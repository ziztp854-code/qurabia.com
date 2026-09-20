import {
  createLiveAccessCredential,
  createLiveAccessToken,
  verifyLiveAccessToken,
} from '@tahaddi/contracts';

function getLiveAccessSecret() {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET is required for live realtime access.');
  }
  return secret;
}

export function createHostLiveAccessToken(
  sessionId: string,
  hostId: string,
  subjectVersion?: number,
) {
  return createLiveAccessToken(getLiveAccessSecret(), {
    sessionId,
    subjectId: hostId,
    role: 'host',
    subjectVersion,
  });
}

export function createHostLiveAccessCredential(
  sessionId: string,
  hostId: string,
  subjectVersion: number,
) {
  return {
    ...createLiveAccessCredential(getLiveAccessSecret(), {
      sessionId,
      subjectId: hostId,
      role: 'host',
      subjectVersion,
    }),
    subjectVersion,
  };
}

export function createPlayerLiveAccessToken(sessionId: string, participantId: string) {
  return createLiveAccessToken(getLiveAccessSecret(), {
    sessionId,
    subjectId: participantId,
    role: 'player',
  });
}

export function createPlayerLiveAccessCredential(sessionId: string, participantId: string) {
  return createLiveAccessCredential(getLiveAccessSecret(), {
    sessionId,
    subjectId: participantId,
    role: 'player',
  });
}

export function verifyHostLiveAccessToken(sessionId: string, hostId: string, token: string) {
  return verifyLiveAccessToken(getLiveAccessSecret(), {
    sessionId,
    subjectId: hostId,
    role: 'host',
    token,
  });
}

export function verifyPlayerLiveAccessToken(
  sessionId: string,
  participantId: string,
  token: string,
) {
  return verifyLiveAccessToken(getLiveAccessSecret(), {
    sessionId,
    subjectId: participantId,
    role: 'player',
    token,
  });
}

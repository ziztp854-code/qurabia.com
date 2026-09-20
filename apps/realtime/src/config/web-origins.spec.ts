import {
  allowWebSocketOrigin,
  allowWebSocketRequest,
  getAllowedWebOrigins,
  isAllowedWebSocketOrigin,
  isSameOriginWebSocketRequest,
} from './web-origins.js';
import { createLiveAccessToken } from '@tahaddi/contracts';

const liveSecret = 'test-live-handshake-secret';

function nativeHeaders(overrides: Record<string, string> = {}) {
  const expiresAt = Date.now() + 60_000;
  return {
    'x-tahaddi-live-session-id': 'session-1',
    'x-tahaddi-live-subject-id': 'player-1',
    'x-tahaddi-live-role': 'player',
    'x-tahaddi-live-expires-at': String(expiresAt),
    'x-tahaddi-live-token': createLiveAccessToken(
      liveSecret,
      { sessionId: 'session-1', subjectId: 'player-1', role: 'player' },
      { expiresAt },
    ),
    ...overrides,
  };
}

describe('getAllowedWebOrigins', () => {
  const originalEnvironment = process.env;

  beforeEach(() => {
    process.env = { ...originalEnvironment };
    delete process.env.WEB_ORIGIN;
    delete process.env.AUTH_URL;
    delete process.env.NEXTAUTH_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    process.env.AUTH_SECRET = liveSecret;
  });

  afterAll(() => {
    process.env = originalEnvironment;
  });

  it('allows local development by default', () => {
    expect(getAllowedWebOrigins()).toEqual([
      'http://localhost:3000',
      'http://localhost:3100',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3100',
    ]);
  });

  it('includes configured, preview, and production origins without duplicates', () => {
    process.env.WEB_ORIGIN =
      'https://play.example.com, https://admin.example.com';
    process.env.VERCEL_URL = 'preview.example.vercel.app';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'play.example.com';

    expect(getAllowedWebOrigins()).toEqual([
      'https://play.example.com',
      'https://admin.example.com',
      'https://preview.example.vercel.app',
      'http://localhost:3000',
      'http://localhost:3100',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3100',
    ]);
  });

  it('allows the alternate local web port used by the local preview', () => {
    expect(isAllowedWebSocketOrigin('http://localhost:3100')).toBe(true);
  });

  it('allows the IPv4 loopback origin used by local browser checks', () => {
    expect(isAllowedWebSocketOrigin('http://127.0.0.1:3000')).toBe(true);
  });

  it('does not expose the local development origin in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.WEB_ORIGIN = 'https://play.example.com';

    expect(getAllowedWebOrigins()).toEqual(['https://play.example.com']);
  });

  it('allows the canonical application origin in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_URL = 'https://qurabia.com';

    expect(getAllowedWebOrigins()).toEqual(['https://qurabia.com']);
    expect(isAllowedWebSocketOrigin('https://qurabia.com')).toBe(true);
    expect(isAllowedWebSocketOrigin('https://qurabia.com.evil.test')).toBe(
      false,
    );
  });

  it('accepts exact normalized origins and rejects missing or lookalike origins', () => {
    process.env.NODE_ENV = 'production';
    process.env.WEB_ORIGIN = 'https://PLAY.example.com:443/';

    expect(isAllowedWebSocketOrigin('https://play.example.com')).toBe(true);
    expect(isAllowedWebSocketOrigin('https://play.example.com/')).toBe(true);
    expect(isAllowedWebSocketOrigin('https://play.example.com.evil.test')).toBe(
      false,
    );
    expect(isAllowedWebSocketOrigin('*')).toBe(false);
    expect(isAllowedWebSocketOrigin('null')).toBe(false);
    expect(isAllowedWebSocketOrigin(undefined)).toBe(false);
  });

  it('allows only a signed originless native handshake while rejecting missing credentials', () => {
    process.env.NODE_ENV = 'production';
    process.env.WEB_ORIGIN = 'https://play.example.com';
    const native = jest.fn();
    const missingCredentials = jest.fn();

    allowWebSocketRequest({ headers: nativeHeaders() }, native);
    allowWebSocketRequest({ headers: {} }, missingCredentials);

    expect(native).toHaveBeenCalledWith(null, true);
    expect(missingCredentials).toHaveBeenCalledWith(null, false);
  });

  it('rejects a forged or expired originless native handshake', () => {
    const forged = jest.fn();
    const expired = jest.fn();
    const expiresAt = Date.now() - 1;

    allowWebSocketRequest(
      { headers: nativeHeaders({ 'x-tahaddi-live-token': 'forged' }) },
      forged,
    );
    allowWebSocketRequest(
      {
        headers: {
          ...nativeHeaders(),
          'x-tahaddi-live-expires-at': String(expiresAt),
          'x-tahaddi-live-token': createLiveAccessToken(
            liveSecret,
            { sessionId: 'session-1', subjectId: 'player-1', role: 'player' },
            { expiresAt },
          ),
        },
      },
      expired,
    );

    expect(forged).toHaveBeenCalledWith(null, false);
    expect(expired).toHaveBeenCalledWith(null, false);
  });

  it('applies the same origin decision to CORS and the Socket.IO handshake', () => {
    process.env.NODE_ENV = 'production';
    process.env.WEB_ORIGIN = 'https://play.example.com';
    const allowed = jest.fn();
    const rejected = jest.fn();

    allowWebSocketOrigin('https://play.example.com', allowed);
    allowWebSocketRequest(
      { headers: { origin: 'https://evil.example.com' } },
      rejected,
    );

    expect(allowed).toHaveBeenCalledWith(null, true);
    expect(rejected).toHaveBeenCalledWith(null, false);
  });

  it('accepts a handshake served from an alias that is not in the allow list', () => {
    process.env.NODE_ENV = 'production';
    process.env.WEB_ORIGIN = 'https://play.example.com';
    const sameOrigin = jest.fn();

    expect(isAllowedWebSocketOrigin('https://alias.example.vercel.app')).toBe(
      false,
    );
    allowWebSocketRequest(
      {
        headers: {
          origin: 'https://alias.example.vercel.app',
          host: 'alias.example.vercel.app',
        },
      },
      sameOrigin,
    );

    expect(sameOrigin).toHaveBeenCalledWith(null, true);
  });

  it('still rejects a cross-site handshake aimed at an allowed host', () => {
    process.env.NODE_ENV = 'production';
    process.env.WEB_ORIGIN = 'https://play.example.com';
    const crossSite = jest.fn();

    allowWebSocketRequest(
      {
        headers: {
          origin: 'https://evil.example.com',
          host: 'alias.example.vercel.app',
        },
      },
      crossSite,
    );

    expect(crossSite).toHaveBeenCalledWith(null, false);
    expect(isSameOriginWebSocketRequest(undefined, 'alias.example.com')).toBe(
      false,
    );
    expect(
      isSameOriginWebSocketRequest('https://alias.example.com', undefined),
    ).toBe(false);
  });
});

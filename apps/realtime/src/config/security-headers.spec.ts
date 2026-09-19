import {
  buildContentSecurityPolicy,
  buildSecurityHeaders,
  createSecurityHeadersMiddleware,
} from './security-headers.js';

const ORIGINS = ['https://qurabia.com', 'http://localhost:3000'];

function directive(policy: string, name: string): string | undefined {
  return policy
    .split('; ')
    .find((entry) => entry.startsWith(`${name} `))
    ?.slice(name.length + 1);
}

describe('buildContentSecurityPolicy', () => {
  it('keeps script-src strict with no inline, eval or third-party vendors', () => {
    const policy = buildContentSecurityPolicy(ORIGINS, {});

    expect(directive(policy, 'script-src')).toBe("'self'");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toContain('pusher.com');
    expect(directive(policy, 'style-src')).toBe("'self' 'unsafe-inline'");
  });

  it('derives connect-src from the allowed web origins with ws(s) twins', () => {
    const connectSrc = directive(
      buildContentSecurityPolicy(ORIGINS, {}),
      'connect-src',
    );

    expect(connectSrc).toBe(
      [
        "'self'",
        'https://qurabia.com',
        'wss://qurabia.com',
        'http://localhost:3000',
        'ws://localhost:3000',
      ].join(' '),
    );
  });

  it('falls back to self-only connect-src when no origins are configured', () => {
    const policy = buildContentSecurityPolicy([], {});

    expect(directive(policy, 'connect-src')).toBe("'self'");
    expect(directive(policy, 'frame-src')).toBe("'self'");
  });

  it('only allows the Vercel Live toolbar on Vercel deployments', () => {
    const local = buildContentSecurityPolicy(ORIGINS, {});
    const vercel = buildContentSecurityPolicy(ORIGINS, { VERCEL: '1' });

    expect(local).not.toContain('vercel.live');
    expect(directive(vercel, 'script-src')).toBe("'self' https://vercel.live");
    expect(directive(vercel, 'connect-src')).toContain('https://vercel.live');
    expect(directive(vercel, 'frame-src')).toBe(
      "'self' https://vercel.live https://*.vercel.live",
    );
  });

  it('keeps the remaining hardening directives', () => {
    const policy = buildContentSecurityPolicy(ORIGINS, {});

    expect(directive(policy, 'default-src')).toBe("'self'");
    expect(directive(policy, 'frame-ancestors')).toBe("'none'");
    expect(directive(policy, 'object-src')).toBe("'none'");
    expect(directive(policy, 'base-uri')).toBe("'self'");
    expect(directive(policy, 'form-action')).toBe("'self'");
    expect(policy.split('; ')).toContain('upgrade-insecure-requests');
  });
});

describe('buildSecurityHeaders', () => {
  it('emits every hardening header exactly once', () => {
    const headers = buildSecurityHeaders(ORIGINS, {});
    const names = headers.map(([name]) => name);

    expect(names).toEqual([
      'Strict-Transport-Security',
      'X-Frame-Options',
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Permissions-Policy',
      'Cross-Origin-Opener-Policy',
      'Cross-Origin-Resource-Policy',
      'X-DNS-Prefetch-Control',
      'X-Permitted-Cross-Domain-Policies',
      'Content-Security-Policy',
    ]);
    expect(new Set(names).size).toBe(names.length);
  });

  it('embeds the generated content security policy', () => {
    const headers = new Map(buildSecurityHeaders(ORIGINS, {}));

    expect(headers.get('Content-Security-Policy')).toBe(
      buildContentSecurityPolicy(ORIGINS, {}),
    );
    expect(headers.get('X-Frame-Options')).toBe('DENY');
    expect(headers.get('Strict-Transport-Security')).toContain('preload');
  });
});

describe('createSecurityHeadersMiddleware', () => {
  it('sets every header on the response and continues the chain', () => {
    const setHeader = jest.fn();
    const next = jest.fn();
    const middleware = createSecurityHeadersMiddleware([
      ['X-Test-One', 'one'],
      ['X-Test-Two', 'two'],
    ]);

    middleware({} as never, { setHeader } as never, next);

    expect(setHeader).toHaveBeenCalledTimes(2);
    expect(setHeader).toHaveBeenCalledWith('X-Test-One', 'one');
    expect(setHeader).toHaveBeenCalledWith('X-Test-Two', 'two');
    expect(next).toHaveBeenCalledTimes(1);
  });
});

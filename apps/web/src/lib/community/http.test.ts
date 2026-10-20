import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertCommunityOrigin,
  communityResponse,
  parseAccountNumber,
  readCommunityJson,
} from './http';
import { CommunityError } from './service';
afterEach(() => vi.unstubAllEnvs());
describe('community HTTP boundaries', () => {
  it('uses the trusted public origin behind an internal reverse-proxy address', () => {
    vi.stubEnv('NEXTAUTH_URL', 'https://qurabia.com');
    const request = (origin: string, crossSite = false) =>
      new Request('http://localhost:3000/api/community/me', {
        method: 'PATCH',
        headers: { origin, ...(crossSite ? { 'sec-fetch-site': 'cross-site' } : {}) },
      });
    expect(() => assertCommunityOrigin(request('https://qurabia.com'))).not.toThrow();
    expect(() => assertCommunityOrigin(request('http://localhost:3000'))).toThrow('CROSS_ORIGIN');
    expect(() => assertCommunityOrigin(request('https://attacker.test'))).toThrow('CROSS_ORIGIN');
    expect(() => assertCommunityOrigin(request('https://qurabia.com', true))).toThrow(
      'CROSS_ORIGIN',
    );
  });
  it('requires same-origin mutations', () => {
    for (const origin of [null, 'https://attacker.test']) {
      const request = new Request('https://qurabia.com/api/community/me', {
        method: 'PATCH',
        headers: origin ? { origin } : {},
      });
      expect(() => assertCommunityOrigin(request)).toThrow('CROSS_ORIGIN');
    }
    expect(() =>
      assertCommunityOrigin(
        new Request('https://qurabia.com/api/community/me', {
          headers: { origin: 'https://qurabia.com' },
        }),
      ),
    ).not.toThrow();
  });
  it('accepts bounded JSON and rejects other content types and oversized streams', async () => {
    const make = (body: string, type = 'application/json') =>
      new Request('https://qurabia.com/api/community/me', {
        method: 'PATCH',
        headers: { origin: 'https://qurabia.com', 'content-type': type },
        body,
      });
    expect(await readCommunityJson(make('{"bio":"hello"}'))).toEqual({ bio: 'hello' });
    await expect(readCommunityJson(make('x', 'text/plain'))).rejects.toMatchObject({ status: 415 });
    await expect(readCommunityJson(make('x'.repeat(300001)))).rejects.toMatchObject({
      status: 413,
    });
  });
  it('accepts only owner or nine-digit public IDs', () => {
    expect(parseAccountNumber('1')).toBe(1);
    expect(parseAccountNumber('123456789')).toBe(123456789);
    for (const value of ['01', '2', '-1', '1e8', '1000000000'])
      expect(() => parseAccountNumber(value)).toThrow('NOT_FOUND');
  });
  it('returns safe errors and never raw server exceptions', async () => {
    const denied = await communityResponse(async () => {
      throw new CommunityError('FORBIDDEN', 403);
    });
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ ok: false, error: 'FORBIDDEN' });
    const crashed = await communityResponse(async () => {
      throw new Error('secret connection string');
    });
    expect(crashed.status).toBe(503);
    expect(await crashed.json()).toEqual({ ok: false, error: 'COMMUNITY_UNAVAILABLE' });
  });
});

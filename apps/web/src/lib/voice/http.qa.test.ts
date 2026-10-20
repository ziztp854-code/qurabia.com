import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/auth/session', () => ({ getCurrentSession: vi.fn() }));
import { assertVoiceOrigin, readVoiceBody, voiceFailure } from './http';

afterEach(() => vi.unstubAllEnvs());

describe('voice HTTP boundaries: independent QA', () => {
  it('requires the configured origin and rejects opaque or cross-site requests', () => {
    vi.stubEnv('NEXTAUTH_URL', 'https://qurabia.com');
    const make = (headers: Record<string, string>) => new Request('https://qurabia.com/api/voice/room', { method: 'POST', headers });
    const cases: Record<string, string>[] = [{}, { origin: 'null' }, { origin: 'https://attacker.test' }, { origin: 'https://qurabia.com', 'sec-fetch-site': 'cross-site' }];
    for (const headers of cases) {
      expect(() => assertVoiceOrigin(make(headers))).toThrow();
    }
    expect(() => assertVoiceOrigin(make({ origin: 'https://qurabia.com', 'sec-fetch-site': 'same-origin' }))).not.toThrow();
  });

  it('rejects unsafe body formats and byte overflow before interpreting commands', async () => {
    const make = (body: string, type = 'application/json') => new Request('https://qurabia.com/api/voice/room', {
      method: 'POST', headers: { 'Content-Type': type }, body,
    });
    expect(await readVoiceBody(make('{"type":"heartbeat"}'))).toEqual({ type: 'heartbeat' });
    await expect(readVoiceBody(make('not-json'))).rejects.toMatchObject({ status: 400 });
    await expect(readVoiceBody(make('{}', 'text/plain'))).rejects.toMatchObject({ status: 415 });
    await expect(readVoiceBody(make('x'.repeat(32_769)))).rejects.toMatchObject({ status: 413 });
    // Bounds are bytes, so multi-byte Arabic payloads cannot bypass the limit.
    await expect(readVoiceBody(make('ع'.repeat(17_000)))).rejects.toMatchObject({ status: 413 });
  });

  it('never serializes a raw server failure and prevents shared error caching', async () => {
    const response = voiceFailure(new Error('postgres://private-token@database.internal'));
    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(response.headers.get('Vary')).toBe('Cookie');
    expect(JSON.stringify(await response.json())).not.toContain('private-token');
  });
});

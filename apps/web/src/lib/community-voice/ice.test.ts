import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { voiceIceConfiguration } from './ice';

afterEach(() => vi.unstubAllEnvs());
describe('voice ICE configuration', () => {
  it('returns public STUN without claiming relay connectivity is configured', () => {
    vi.stubEnv('VOICE_TURN_URLS', '');
    vi.stubEnv('VOICE_TURN_SHARED_SECRET', '');
    const result = voiceIceConfiguration('user', 1_800_000_000_000);
    expect(result.turnConfigured).toBe(false);
    expect(result.iceServers).toEqual([{ urls: ['stun:stun.cloudflare.com:3478'] }]);
  });
  it('issues short-lived authenticated relay credentials, never the server secret', () => {
    vi.stubEnv(
      'VOICE_TURN_URLS',
      'turn:relay.example.test:3478?transport=udp,turns:relay.example.test:5349?transport=tcp',
    );
    vi.stubEnv('VOICE_TURN_SHARED_SECRET', 'server-only-relay-secret');
    const result = voiceIceConfiguration('user', 1_800_000_000_000);
    expect(result.turnConfigured).toBe(true);
    const relay = result.iceServers[1];
    expect(relay.username).toBe('1800000600:user');
    expect(relay.credential).toBe(
      createHmac('sha1', 'server-only-relay-secret').update(relay.username!).digest('base64'),
    );
    expect(JSON.stringify(result)).not.toContain('server-only-relay-secret');
  });
  it('filters unrelated protocols and credentials embedded in relay URLs', () => {
    vi.stubEnv('VOICE_TURN_URLS', 'https://attacker.test,turn:user:password@relay.test:3478');
    vi.stubEnv('VOICE_TURN_SHARED_SECRET', 'secret');
    expect(voiceIceConfiguration('user').turnConfigured).toBe(false);
  });
});

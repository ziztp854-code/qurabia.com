import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { jsonFailure, readVoiceBody, voiceOrigin } from './http';
afterEach(() => vi.unstubAllEnvs());
describe('voice HTTP trust boundary', () => {
  it('accepts only the canonical same origin and ignores forwarded host spoofing', () => {
    vi.stubEnv('NEXTAUTH_URL', 'https://tahaddi.example');
    expect(() =>
      voiceOrigin(
        new Request('http://upstream/api/voice', {
          headers: { origin: 'https://tahaddi.example' },
        }),
      ),
    ).not.toThrow();
    for (const origin of ['https://attacker.example', 'null', ''])
      expect(() =>
        voiceOrigin(
          new Request('http://upstream/api/voice', {
            headers: { origin, 'x-forwarded-host': 'attacker.example' },
          }),
        ),
      ).toThrow();
  });
  it('bounds streamed body bytes and rejects malformed JSON/content type/unknown fields', async () => {
    const schema = z.object({ text: z.string() }).strict();
    const request = (body: string, type = 'application/json') =>
      new Request('https://tahaddi.example/api/voice', {
        method: 'POST',
        headers: { 'content-type': type },
        body,
      });
    await expect(
      readVoiceBody(request(JSON.stringify({ text: 'مرحبا' })), schema),
    ).resolves.toEqual({ text: 'مرحبا' });
    await expect(
      readVoiceBody(request(JSON.stringify({ text: 'x'.repeat(17_000) })), schema),
    ).rejects.toMatchObject({ status: 413 });
    await expect(readVoiceBody(request('{'), schema)).rejects.toMatchObject({ status: 400 });
    await expect(readVoiceBody(request('{}', 'text/plain'), schema)).rejects.toMatchObject({
      status: 415,
    });
    await expect(
      readVoiceBody(request('{"text":"hello","role":"host"}'), schema),
    ).rejects.toThrow();
  });
  it('never exposes database exception text to clients', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = jsonFailure(new Error('postgresql://secret:password@example'));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('password');
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    log.mockRestore();
  });
});

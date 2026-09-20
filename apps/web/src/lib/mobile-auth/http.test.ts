import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseMobileJson } from './http';

describe('mobile auth HTTP boundary', () => {
  it('rejects an oversized body even when content-length is absent', async () => {
    const request = new Request('https://qurabia.com/api/mobile/auth/sign-in', {
      method: 'POST',
      body: JSON.stringify({ value: 'أ'.repeat(20_000) }),
    });
    request.headers.delete('content-length');

    expect(await parseMobileJson(request, z.object({ value: z.string() }))).toBeNull();
  });

  it('rejects unknown fields when the route supplies a strict schema', async () => {
    const request = new Request('https://qurabia.com/api/mobile/auth/sign-in', {
      method: 'POST',
      body: JSON.stringify({ email: 'user@example.com', extra: true }),
    });

    expect(
      await parseMobileJson(request, z.object({ email: z.string().email() }).strict()),
    ).toBeNull();
  });
});

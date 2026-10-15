import { describe, expect, it } from 'vitest';
import { authorizeService } from './protocol';

describe('OpenClaw restricted tool interface', () => {
  it('fails closed until explicitly enabled with a strong service token', () => {
    expect(() => authorizeService('Bearer ' + 'a'.repeat(32), {})).toThrow();
    expect(() =>
      authorizeService('Bearer short', {
        QURABIA_OPENCLAW_ENABLED: 'true',
        QURABIA_OPENCLAW_SERVICE_TOKEN: 'short',
      }),
    ).toThrow();
    expect(() =>
      authorizeService('Bearer ' + 'a'.repeat(32), {
        QURABIA_OPENCLAW_ENABLED: 'true',
        QURABIA_OPENCLAW_SERVICE_TOKEN: 'a'.repeat(32),
      }),
    ).not.toThrow();
  });
});

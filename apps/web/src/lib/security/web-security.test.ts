import { describe, expect, it } from 'vitest';
import { nextHeaderRules } from '@/test/next-header-rules';
import { buildWebContentSecurityPolicy } from '../../../../../config/web-security.mjs';

describe('game browser permissions', () => {
  it('keeps same-origin speaker selection and denies microphone capture in the embedded game', async () => {
    const rules = await nextHeaderRules();
    const general = rules.find((rule) => ['/:path*', '/(.*)'].includes(rule.source));
    const policy = general?.headers.find((header) => header.key === 'Permissions-Policy')?.value;
    expect(policy).toContain('speaker-selection=(self)');
    expect(policy).toContain('camera=()');
    const embedded = rules.find((rule) => rule.source === '/games/sultan-farm/index.html');
    expect(
      embedded?.headers.find((header) => header.key === 'Permissions-Policy')?.value,
    ).toContain('microphone=()');
  });

  it('keeps game realtime origins without allowing the retired media gateway', () => {
    const csp = buildWebContentSecurityPolicy({
      NODE_ENV: 'production',
      NEXT_PUBLIC_REALTIME_URL: 'https://realtime.example.test',
      LIVEKIT_URL: 'wss://voice.example.test',
      LIVEKIT_MODE: 'cloud',
    });
    expect(csp).toContain('https://realtime.example.test');
    expect(csp).toContain('wss://realtime.example.test');
    expect(csp).not.toContain('voice.example.test');
    expect(csp).not.toContain('livekit.cloud');
  });
});

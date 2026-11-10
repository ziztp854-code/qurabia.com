import { describe, expect, it } from 'vitest';
import { nextHeaderRules } from '@/test/next-header-rules';

describe('voice microphone browser permissions', () => {
  it('preserves same-origin persistent audio and denies capture inside the embedded game', async () => {
    const rules = await nextHeaderRules();
    const general = rules.find((rule) => ['/:path*', '/(.*)'].includes(rule.source));
    const policy = general?.headers.find((header) => header.key === 'Permissions-Policy')?.value;
    expect(policy).toContain('microphone=(self)');
    expect(policy).toContain('speaker-selection=(self)');
    expect(policy).toContain('camera=()');
    const embedded = rules.find((rule) => rule.source === '/games/sultan-farm/index.html');
    expect(
      embedded?.headers.find((header) => header.key === 'Permissions-Policy')?.value,
    ).toContain('microphone=()');
  });
});

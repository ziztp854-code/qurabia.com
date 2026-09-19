import { describe, expect, it } from 'vitest';
import {
  AI_DISCOVERY_USER_AGENTS,
  DISCOVERY_DISALLOW_PATHS,
  buildDiscoveryRobots,
  buildSiteVerificationMetadata,
} from './discovery';

describe('discovery metadata', () => {
  it('allows public crawling and lists AI user agents explicitly', () => {
    const robots = buildDiscoveryRobots();
    const rulesList = Array.isArray(robots.rules) ? robots.rules : [robots.rules];

    expect(robots.sitemap).toBe('https://qurabia.com/sitemap.xml');
    expect(robots.host).toBe('https://qurabia.com');
    expect(rulesList).toHaveLength(AI_DISCOVERY_USER_AGENTS.length + 1);

    const wildcard = rulesList.find((rule) => rule.userAgent === '*');
    expect(wildcard).toEqual(
      expect.objectContaining({
        allow: '/',
        disallow: expect.arrayContaining([...DISCOVERY_DISALLOW_PATHS]),
      }),
    );

    for (const userAgent of AI_DISCOVERY_USER_AGENTS) {
      const rule = rulesList.find((entry) => entry.userAgent === userAgent);
      expect(rule).toEqual(
        expect.objectContaining({
          allow: '/',
          disallow: expect.arrayContaining(['/admin/', '/live/']),
        }),
      );
    }
  });

  it('builds verification metadata only when env keys are set', () => {
    const original = {
      google: process.env.GOOGLE_SITE_VERIFICATION,
      bing: process.env.BING_SITE_VERIFICATION,
      yandex: process.env.YANDEX_SITE_VERIFICATION,
    };

    delete process.env.GOOGLE_SITE_VERIFICATION;
    delete process.env.BING_SITE_VERIFICATION;
    delete process.env.YANDEX_SITE_VERIFICATION;
    expect(buildSiteVerificationMetadata()).toBeUndefined();

    process.env.GOOGLE_SITE_VERIFICATION = 'google-token';
    process.env.BING_SITE_VERIFICATION = 'bing-token';
    expect(buildSiteVerificationMetadata()).toEqual({
      google: 'google-token',
      other: { 'msvalidate.01': 'bing-token' },
    });

    process.env.GOOGLE_SITE_VERIFICATION = original.google;
    process.env.BING_SITE_VERIFICATION = original.bing;
    process.env.YANDEX_SITE_VERIFICATION = original.yandex;
  });
});

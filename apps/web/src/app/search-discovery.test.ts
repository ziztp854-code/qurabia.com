import { describe, expect, it, vi } from 'vitest';

vi.mock('next/font/google', () => ({
  Alexandria: () => ({ variable: '--font-alexandria' }),
  Cairo: () => ({ variable: '--font-arabic' }),
}));

import { metadata, structuredData } from './layout';
import manifest from './manifest';
import robots from './robots';
import sitemap from './sitemap';

describe('search discovery metadata', () => {
  it('uses the custom domain and descriptive Arabic metadata', () => {
    expect(new URL(metadata.metadataBase!).origin).toBe('https://qurabia.com');
    expect(metadata.title).toContain('مسابقات وألعاب جماعية عربية مباشرة');
    expect(metadata.description).toContain('منصة عربية لإنشاء المسابقات');
    expect(metadata.alternates?.canonical).toBeUndefined();
    expect(metadata.robots).toEqual(expect.objectContaining({ index: true, follow: true }));
  });

  it('defines the brand aliases and square logo used by search engines and installs', () => {
    const [website, organization] = structuredData['@graph'];

    expect(website).toEqual(
      expect.objectContaining({
        '@type': 'WebSite',
        name: 'تحدّي',
        alternateName: ['تحدي', 'Tahaddi', 'Qurabia', 'qurabia.com'],
      }),
    );
    expect(organization).toEqual(
      expect.objectContaining({
        '@type': 'Organization',
        alternateName: ['تحدي', 'Tahaddi', 'Qurabia'],
        logo: 'https://qurabia.com/icon.png',
      }),
    );
    expect(manifest().icons).toEqual([
      expect.objectContaining({ src: '/icon.png', sizes: '512x512' }),
    ]);
  });

  it('publishes the canonical public routes in the sitemap', () => {
    const urls = sitemap().map((entry) => entry.url);

    expect(urls).toContain('https://qurabia.com/');
    expect(urls).toContain('https://qurabia.com/games/chess/');
    expect(urls).toContain('https://qurabia.com/games/knowledge-tower/');
    expect(urls).toContain('https://qurabia.com/games/memory-flash/');
    expect(urls).toContain('https://qurabia.com/leaderboard/');
    expect(urls).toContain('https://qurabia.com/join/');
    expect(urls).toContain('https://qurabia.com/display/');
    expect(urls).toContain('https://qurabia.com/contact/');
    expect(urls).toContain('https://qurabia.com/privacy/');
    expect(urls).toContain('https://qurabia.com/terms/');
    expect(urls).toContain('https://qurabia.com/dedication/');
    expect(urls).not.toContain('https://qurabia.com/questions/');
    expect(urls).not.toContain('https://qurabia.com/games/spectrum/');
    expect(new Set(urls).size).toBe(urls.length);
    expect(sitemap().every((entry) => entry.lastModified instanceof Date)).toBe(true);
    expect(sitemap().find((entry) => entry.url === 'https://qurabia.com/')?.lastModified).toEqual(
      new Date('2026-09-06T00:00:00.000Z'),
    );
  });

  it('allows public crawling and points search engines to the sitemap', () => {
    const rules = robots();

    expect(rules.sitemap).toBe('https://qurabia.com/sitemap.xml');
    expect(rules.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userAgent: '*',
          allow: '/',
          disallow: expect.arrayContaining([
            '/admin/',
            '/api/',
            '/auth/',
            '/dashboard/',
            '/broadcast/',
            '/host/',
            '/live/',
            '/profile/',
            '/questions/',
            '/preview/',
          ]),
        }),
        expect.objectContaining({
          userAgent: 'GPTBot',
          allow: '/',
        }),
        expect.objectContaining({
          userAgent: 'ClaudeBot',
          allow: '/',
        }),
      ]),
    );
  });
});

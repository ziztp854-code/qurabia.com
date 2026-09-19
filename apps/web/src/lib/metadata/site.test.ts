import { describe, expect, it } from 'vitest';
import { INSTANT_GAME_ORDER, SPECIAL_GAME_ORDER } from '@tahaddi/domain';
import {
  buildGameMetadata,
  buildJoinMetadata,
  buildPublicPageMetadata,
  PUBLIC_GAME_PAGES,
  SHARE_IMAGE_URL,
  SITE_URL,
} from './site';

describe('share metadata', () => {
  it('uses the production host and the public Open Graph image', () => {
    expect(SITE_URL.origin).toBe('https://qurabia.com');
    expect(SHARE_IMAGE_URL).toBe('https://qurabia.com/og.png');
  });

  it('builds room-specific metadata without exposing malformed code characters', () => {
    const metadata = buildJoinMetadata(' ab-12/? ');

    expect(metadata.title).toBe('انضم إلى غرفة AB12 | تحدّي');
    expect(metadata.alternates?.canonical).toBe('/join/AB12');
    expect(metadata.openGraph?.url).toBe('/join/AB12');
    expect(metadata.openGraph?.images).toEqual([
      expect.objectContaining({
        url: 'https://qurabia.com/og.png',
        width: 1200,
        height: 630,
      }),
    ]);
    expect(metadata.twitter?.images).toEqual(['https://qurabia.com/og.png']);
    expect(metadata.robots).toEqual(expect.objectContaining({ index: false, follow: false }));
  });

  it('builds unique canonical metadata for every public game', () => {
    for (const game of PUBLIC_GAME_PAGES) {
      const metadata = buildGameMetadata(game.slug);

      expect(metadata.title).toContain(game.title);
      expect(metadata.description).toBe(game.description);
      expect(metadata.alternates?.canonical).toBe(`/games/${game.slug}`);
      expect(metadata.openGraph?.url).toBe(`/games/${game.slug}`);
    }
  });

  it('keeps the SEO game catalogue aligned with every playable route', () => {
    expect(PUBLIC_GAME_PAGES.map((game) => game.slug)).toEqual([
      ...SPECIAL_GAME_ORDER,
      ...INSTANT_GAME_ORDER,
    ]);
  });

  it('builds canonical metadata for public discovery pages', () => {
    const metadata = buildPublicPageMetadata({
      path: '/leaderboard',
      title: 'لوحة الشرف | تحدّي',
      description: 'ترتيب لاعبي تحدّي ونتائج المنافسات الجماعية المباشرة.',
    });

    expect(metadata.alternates?.canonical).toBe('/leaderboard');
    expect(metadata.openGraph?.url).toBe('/leaderboard');
    expect(metadata.twitter?.images).toEqual(['https://qurabia.com/og.png']);
  });
});

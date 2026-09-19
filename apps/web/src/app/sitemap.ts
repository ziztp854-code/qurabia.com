import type { MetadataRoute } from 'next';
import { PUBLIC_GAME_PAGES, SITE_URL } from '@/lib/metadata/site';

const searchDiscoveryUpdatedAt = new Date('2026-08-12T00:00:00.000Z');
const homeUpdatedAt = new Date('2026-09-06T00:00:00.000Z');

const publicRoutes = [
  { path: '/', changeFrequency: 'weekly', priority: 1, lastModified: homeUpdatedAt },
  { path: '/games/', changeFrequency: 'weekly', priority: 0.9, lastModified: searchDiscoveryUpdatedAt },
  { path: '/mafia/', changeFrequency: 'weekly', priority: 0.8, lastModified: searchDiscoveryUpdatedAt },
  { path: '/leaderboard/', changeFrequency: 'daily', priority: 0.8, lastModified: searchDiscoveryUpdatedAt },
  { path: '/join/', changeFrequency: 'monthly', priority: 0.8, lastModified: searchDiscoveryUpdatedAt },
  { path: '/display/', changeFrequency: 'monthly', priority: 0.7, lastModified: searchDiscoveryUpdatedAt },
  { path: '/quizzes/', changeFrequency: 'daily', priority: 0.8, lastModified: searchDiscoveryUpdatedAt },
  { path: '/contact/', changeFrequency: 'monthly', priority: 0.5, lastModified: searchDiscoveryUpdatedAt },
  { path: '/privacy/', changeFrequency: 'yearly', priority: 0.3, lastModified: searchDiscoveryUpdatedAt },
  { path: '/terms/', changeFrequency: 'yearly', priority: 0.3, lastModified: searchDiscoveryUpdatedAt },
  { path: '/dedication/', changeFrequency: 'yearly', priority: 0.2, lastModified: searchDiscoveryUpdatedAt },
  ...PUBLIC_GAME_PAGES.map((game) => ({
    path: `/games/${game.slug}/` as const,
    changeFrequency: 'weekly' as const,
    priority: game.slug === 'chess' ? 0.9 : 0.8,
    lastModified: searchDiscoveryUpdatedAt,
  })),
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return publicRoutes.map(({ path, changeFrequency, priority, lastModified }) => ({
    url: new URL(path, SITE_URL).toString(),
    changeFrequency,
    priority,
    lastModified,
  }));
}

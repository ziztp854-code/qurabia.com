import type { Metadata, MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/metadata/site';

/** Routes that must not appear in search, AI, or browser discovery indexes. */
export const DISCOVERY_DISALLOW_PATHS = [
  '/admin/',
  '/api/',
  '/auth/',
  '/broadcast/',
  '/dashboard/',
  '/host/',
  '/live/',
  '/mafia/*/',
  '/profile/',
  '/questions/',
  '/quizzes/new/',
  '/preview/',
] as const;

/** Crawlers used by AI assistants and answer engines — explicitly allowed on public pages. */
export const AI_DISCOVERY_USER_AGENTS = [
  'GPTBot',
  'ChatGPT-User',
  'OAI-SearchBot',
  'ClaudeBot',
  'anthropic-ai',
  'PerplexityBot',
  'Google-Extended',
  'Applebot-Extended',
  'Bytespider',
  'CCBot',
  'FacebookBot',
  'meta-externalagent',
] as const;

export function buildDiscoveryRobots(): MetadataRoute.Robots {
  const disallow = [...DISCOVERY_DISALLOW_PATHS];
  const sitemap = new URL('/sitemap.xml', SITE_URL).toString();

  const publicRule = {
    userAgent: '*',
    allow: '/' as const,
    disallow,
  };

  const aiRules = AI_DISCOVERY_USER_AGENTS.map((userAgent) => ({
    userAgent,
    allow: '/' as const,
    disallow,
  }));

  return {
    rules: [publicRule, ...aiRules],
    sitemap,
    host: SITE_URL.origin,
  };
}

export function buildSiteVerificationMetadata(): Metadata['verification'] | undefined {
  const google = process.env.GOOGLE_SITE_VERIFICATION?.trim();
  const bing = process.env.BING_SITE_VERIFICATION?.trim();
  const yandex = process.env.YANDEX_SITE_VERIFICATION?.trim();

  if (!google && !bing && !yandex) {
    return undefined;
  }

  const other: Record<string, string> = {};
  if (bing) other['msvalidate.01'] = bing;
  if (yandex) other.yandex = yandex;

  return {
    ...(google ? { google } : {}),
    ...(Object.keys(other).length > 0 ? { other } : {}),
  };
}

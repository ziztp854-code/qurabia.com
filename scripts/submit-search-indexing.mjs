#!/usr/bin/env node
/**
 * Ping search engines and IndexNow after sitemap updates.
 * Usage: node scripts/submit-search-indexing.mjs [--site https://qurabia.com]
 */

const DEFAULT_SITE = 'https://qurabia.com';

function parseSite(argv) {
  const flagIndex = argv.indexOf('--site');
  if (flagIndex !== -1 && argv[flagIndex + 1]) {
    return argv[flagIndex + 1].replace(/\/$/, '');
  }
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim()?.replace(/\/$/, '') ||
    process.env.SITE_URL?.trim()?.replace(/\/$/, '') ||
    DEFAULT_SITE
  );
}

async function ping(url, label) {
  try {
    const response = await fetch(url, { method: 'GET', redirect: 'follow' });
    const ok = response.ok;
    const note =
      response.status === 404 || response.status === 410
        ? ' (deprecated — use Search Console / Webmaster Tools)'
        : '';
    console.log(`${ok ? '✓' : '○'} ${label}: ${response.status} ${response.statusText}${note}`);
    return ok;
  } catch (error) {
    console.log(`✗ ${label}: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function submitIndexNow(siteUrl, key, urls) {
  const endpoint = 'https://api.indexnow.org/indexnow';
  const body = {
    host: new URL(siteUrl).host,
    key,
    keyLocation: `${siteUrl}/${key}.txt`,
    urlList: urls,
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    });
    const ok = response.ok;
    console.log(`${ok ? '✓' : '✗'} IndexNow: ${response.status} ${response.statusText}`);
    return ok;
  } catch (error) {
    console.log(`✗ IndexNow: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function fetchSitemapUrls(siteUrl) {
  const sitemapUrl = `${siteUrl}/sitemap.xml`;
  const response = await fetch(sitemapUrl);
  if (!response.ok) {
    throw new Error(`Sitemap fetch failed: ${response.status}`);
  }
  const xml = await response.text();
  const matches = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)];
  return matches.map((match) => match[1]);
}

async function main() {
  const siteUrl = parseSite(process.argv.slice(2));
  const sitemapUrl = `${siteUrl}/sitemap.xml`;
  const indexNowKey = process.env.INDEXNOW_KEY?.trim();

  console.log(`Submitting discovery signals for ${siteUrl}`);
  console.log(`Sitemap: ${sitemapUrl}`);

  await ping(`https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`, 'Google sitemap ping');
  await ping(`https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`, 'Bing sitemap ping');

  if (indexNowKey) {
    try {
      const urls = await fetchSitemapUrls(siteUrl);
      await submitIndexNow(siteUrl, indexNowKey, urls.slice(0, 100));
    } catch (error) {
      console.log(`✗ IndexNow skipped: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    console.log('○ IndexNow skipped (set INDEXNOW_KEY to enable)');
  }

  console.log('\nManual steps if needed:');
  console.log(`  Google Search Console: add property + submit ${sitemapUrl}`);
  console.log(`  Bing Webmaster Tools: add site + submit ${sitemapUrl}`);
  console.log(`  Verify llms.txt: ${siteUrl}/llms.txt`);
}

main();

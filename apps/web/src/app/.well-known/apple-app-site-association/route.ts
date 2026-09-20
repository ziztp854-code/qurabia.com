import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IOS_BUNDLE_IDENTIFIER = 'com.qurabia.tahaddi';
const APPLE_TEAM_ID_PATTERN = /^[A-Z0-9]{10}$/;

export function buildAppleAppSiteAssociation(teamId: string | undefined) {
  const normalizedTeamId = teamId?.trim();
  if (!normalizedTeamId || !APPLE_TEAM_ID_PATTERN.test(normalizedTeamId)) return null;

  return {
    applinks: {
      apps: [],
      details: [
        {
          appID: `${normalizedTeamId}.${IOS_BUNDLE_IDENTIFIER}`,
          paths: ['/join/*'],
        },
      ],
    },
  } as const;
}

export function GET() {
  const association = buildAppleAppSiteAssociation(process.env.APPLE_TEAM_ID);
  if (!association) {
    return NextResponse.json(
      { error: 'APPLE_APP_SITE_ASSOCIATION_NOT_CONFIGURED' },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      },
    );
  }

  return NextResponse.json(association, {
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

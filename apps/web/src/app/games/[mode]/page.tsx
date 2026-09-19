import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  INJECTED_GAME_CATALOG,
  isSpecialGameMode,
  SPECIAL_GAME_ORDER,
  type SpecialGameMode,
} from '@tahaddi/domain';
import { INSTANT_GAME_ORDER, InstantGameRoom, isInstantGameMode } from '@/components/instant-games';
import { SiteLayout } from '@/components/layout';
import { SpecialGameRoom } from '@/components/special-games/special-game-room';
import { ChessRoom } from '@/components/special-games/chess-room';
import { getCurrentSession } from '@/lib/auth/session';
import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import { hasPlanFlag } from '@/lib/subscription/entitlements';
import { buildGameMetadata } from '@/lib/metadata/site';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ mode: string }>;
}): Promise<Metadata> {
  const { mode } = await params;
  return buildGameMetadata(mode);
}

export function generateStaticParams() {
  return [...SPECIAL_GAME_ORDER, ...INSTANT_GAME_ORDER].map((mode) => ({ mode }));
}

export default async function SpecialGamePage({
  params,
  searchParams,
}: {
  params: Promise<{ mode: string }>;
  searchParams: Promise<{ join?: string }>;
}) {
  const [{ mode }, query, session] = await Promise.all([params, searchParams, getCurrentSession()]);
  if (!isSpecialGameMode(mode) && !isInstantGameMode(mode)) notFound();

  // Upcoming games are an early-access privilege: SULTAN plan or staff bypass.
  const catalogGame = INJECTED_GAME_CATALOG.find((game) => game.mode === mode);
  if (catalogGame?.kind === 'upcoming') {
    const user = session?.user;
    const allowed =
      user && hasDatabaseUrl()
        ? await hasPlanFlag(getPrismaClient(), user.id, 'earlyAccessGames', user.role)
        : false;
    if (!allowed) notFound();
  }

  if (mode === 'chess') {
    return (
      <SiteLayout
        user={session?.user ? { name: session.user.name, role: session.user.role } : null}
      >
        <ChessRoom initialPin={query.join?.replace(/\D/g, '').slice(0, 6) ?? ''} />
      </SiteLayout>
    );
  }

  return (
    <SiteLayout user={session?.user ? { name: session.user.name, role: session.user.role } : null}>
      {isSpecialGameMode(mode) ? (
        <SpecialGameRoom
          mode={mode as SpecialGameMode}
          initialPin={query.join?.replace(/\D/g, '').slice(0, 6) ?? ''}
        />
      ) : (
        <InstantGameRoom mode={mode} />
      )}
    </SiteLayout>
  );
}

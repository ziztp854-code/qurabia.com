import type { Metadata } from 'next';
import { SiteLayout } from '@/components/layout';
import { ButtonLink } from '@/components/ui';
import { MamlukWorldMap } from '@/components/mamluk-map/mamluk-world-map';
import { getCurrentSession } from '@/lib/auth/session';
import { kingdomIdentity } from '@/lib/kingdoms/identity';
import { KingdomsHttpError } from '@/lib/kingdoms/http';
import { listMamlukMapWorlds } from '@/lib/mamluk-map/repository';
import { PUBLIC_ATLAS_VIEWER_ID, PUBLIC_ATLAS_WORLD } from '@/lib/mamluk-map/public-atlas';

export const metadata: Metadata = {
  title: 'خريطة العالم | حروب المماليك | قرابية',
  description: 'خريطة استراتيجية تفاعلية لمصر والشام والحجاز بإحداثيات جغرافية حقيقية.',
};

export default async function WorldMapPage() {
  const session = await getCurrentSession();
  let user: { name?: string | null; role?: string | null } | undefined;
  let viewerPlayerId = PUBLIC_ATLAS_VIEWER_ID;
  let campaigns: readonly { id: string; name: string }[] = [];
  if (session?.user?.id) {
    try {
      const identity = await kingdomIdentity();
      campaigns = (
        await listMamlukMapWorlds({ id: identity.id, tokenVersion: identity.tokenVersion })
      ).filter((world) => world.id !== PUBLIC_ATLAS_WORLD.id);
      user = { name: session.user.name, role: identity.role };
      if (campaigns.length) viewerPlayerId = identity.id;
    } catch (error) {
      // A revoked login may see public landmarks, never a private campaign list.
      if (!(error instanceof KingdomsHttpError) || error.status !== 401) throw error;
    }
  }
  const referenceOnly = campaigns.length === 0;
  const worlds = referenceOnly ? [PUBLIC_ATLAS_WORLD] : campaigns;
  return (
    <SiteLayout user={user}>
      {!user && (
        <p dir="rtl">
          <ButtonLink href="/auth/sign-in?next=%2Fgames%2Fkingdoms%2Fworld-map" variant="outline">
            تسجيل الدخول لعرض حملتك
          </ButtonLink>
        </p>
      )}
      <MamlukWorldMap
        worlds={worlds}
        initialWorldId={worlds[0].id}
        viewerPlayerId={viewerPlayerId}
        referenceOnly={referenceOnly}
      />
    </SiteLayout>
  );
}

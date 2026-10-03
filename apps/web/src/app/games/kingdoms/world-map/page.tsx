import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SiteLayout } from '@/components/layout';
import { ButtonLink } from '@/components/ui';
import { MamlukWorldMap } from '@/components/mamluk-map/mamluk-world-map';
import { getCurrentSession } from '@/lib/auth/session';
import { kingdomIdentity } from '@/lib/kingdoms/identity';
import { KingdomsHttpError } from '@/lib/kingdoms/http';
import { getOwnVillageMapLocations, listMamlukMapWorlds } from '@/lib/mamluk-map/repository';
import { PUBLIC_ATLAS_VIEWER_ID, PUBLIC_ATLAS_WORLD } from '@/lib/mamluk-map/public-atlas';

export const metadata: Metadata = {
  title: 'خريطة العالم | حروب المماليك | قرابية',
  description: 'خريطة استراتيجية تفاعلية لمصر والشام والحجاز بإحداثيات جغرافية حقيقية.',
};

export default async function WorldMapPage({
  searchParams,
}: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
  const query = await searchParams;
  const requestedWorld = typeof query?.worldId === 'string' ? query.worldId : undefined;
  const requestedVillage = typeof query?.villageId === 'string' ? query.villageId : undefined;
  const session = await getCurrentSession();
  let user: { name?: string | null; role?: string | null } | undefined;
  let viewerPlayerId = PUBLIC_ATLAS_VIEWER_ID;
  let campaigns: readonly { id: string; name: string }[] = [];
  let identityContext: { id: string; tokenVersion: number } | undefined;
  if (session?.user?.id) {
    try {
      const identity = await kingdomIdentity();
      campaigns = (
        await listMamlukMapWorlds({ id: identity.id, tokenVersion: identity.tokenVersion })
      ).filter((world) => world.id !== PUBLIC_ATLAS_WORLD.id);
      user = { name: session.user.name, role: identity.role };
      identityContext = { id: identity.id, tokenVersion: identity.tokenVersion };
      if (campaigns.length) viewerPlayerId = identity.id;
    } catch (error) {
      // A revoked login may see public landmarks, never a private campaign list.
      if (!(error instanceof KingdomsHttpError) || error.status !== 401) throw error;
    }
  }
  const referenceOnly = campaigns.length === 0;
  const worlds = referenceOnly ? [PUBLIC_ATLAS_WORLD] : campaigns;
  const selectedWorld =
    referenceOnly || !requestedWorld
      ? worlds[0]
      : worlds.find((world) => world.id === requestedWorld);
  if (!selectedWorld) notFound();
  const villageLocations =
    !referenceOnly && identityContext
      ? await getOwnVillageMapLocations(selectedWorld.id, identityContext)
      : undefined;
  const selectedVillage =
    requestedVillage && !referenceOnly
      ? villageLocations?.find((village) => village.villageId === requestedVillage)
      : villageLocations?.[0];
  if (requestedVillage && !referenceOnly && villageLocations?.length && !selectedVillage)
    notFound();
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
        key={`${selectedWorld.id}:${viewerPlayerId}`}
        worlds={worlds}
        initialWorldId={selectedWorld.id}
        viewerPlayerId={viewerPlayerId}
        referenceOnly={referenceOnly}
        villageLocations={villageLocations}
        initialVillageId={selectedVillage?.villageId}
        initialLocation={
          selectedVillage && {
            longitude: selectedVillage.longitude,
            latitude: selectedVillage.latitude,
          }
        }
      />
    </SiteLayout>
  );
}

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PUBLIC_ATLAS_VIEWER_ID, PUBLIC_ATLAS_WORLD } from '@/lib/mamluk-map/public-atlas';
import { KingdomsHttpError } from '@/lib/kingdoms/http';

const dependencies = vi.hoisted(() => ({
  session: vi.fn(),
  identity: vi.fn(),
  list: vi.fn(),
  locations: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('Not found');
  },
}));
vi.mock('@/lib/auth/session', () => ({ getCurrentSession: dependencies.session }));
vi.mock('@/lib/kingdoms/identity', () => ({ kingdomIdentity: dependencies.identity }));
vi.mock('@/lib/mamluk-map/repository', () => ({
  listMamlukMapWorlds: dependencies.list,
  getOwnVillageMapLocations: dependencies.locations,
}));
vi.mock('@/components/layout', () => ({ SiteLayout: () => null, PageBackButton: () => null }));
vi.mock('@/components/mamluk-map/mamluk-world-map', () => ({ MamlukWorldMap: () => null }));
import WorldMapPage from './page';

describe('authenticated geographic atlas page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dependencies.session.mockResolvedValue({
      user: {
        id: 'alice',
        name: 'Alice',
        role: 'USER',
        tokenVersion: 3,
      },
    });
    dependencies.identity.mockResolvedValue({ id: 'alice', role: 'USER', tokenVersion: 3 });
    dependencies.locations.mockResolvedValue([]);
  });
  it('focuses the requested own village in an authorized nonfirst world', async () => {
    dependencies.list.mockResolvedValue([
      { id: 'first', name: 'First' },
      { id: 'second', name: 'Second' },
    ]);
    const village = { villageId: 'own-village', name: 'قريتي', longitude: 36.29, latitude: 33.51 };
    dependencies.locations.mockResolvedValue([village]);
    const page = await WorldMapPage({
      searchParams: Promise.resolve({ worldId: 'second', villageId: 'own-village' }),
    });
    expect(dependencies.locations).toHaveBeenCalledWith('second', { id: 'alice', tokenVersion: 3 });
    expect(page.props.children.props).toMatchObject({
      initialWorldId: 'second',
      initialVillageId: 'own-village',
      initialLocation: { longitude: 36.29, latitude: 33.51 },
      villageLocations: [village],
    });
    expect(page.props.children.key).toBe('second:alice');
  });
  it('preserves explicit campaign geography when a legacy village has no mapped geographic location', async () => {
    dependencies.list.mockResolvedValue([{ id: 'explicit-campaign', name: 'Existing campaign' }]);
    dependencies.locations.mockResolvedValue([]);
    const page = await WorldMapPage({
      searchParams: Promise.resolve({ worldId: 'explicit-campaign', villageId: 'legacy-village' }),
    });
    expect(page.props.children.props).toMatchObject({
      initialWorldId: 'explicit-campaign',
      referenceOnly: false,
      villageLocations: [],
    });
    expect(page.props.children.props.initialLocation).toBeUndefined();
    expect(page.props.children.props.initialVillageId).toBeUndefined();
  });
  it('opens directly at the player’s first village when no village is requested', async () => {
    dependencies.list.mockResolvedValue([{ id: 'world', name: 'My world' }]);
    dependencies.locations.mockResolvedValue([
      { villageId: 'own', name: 'قريتي', longitude: 31, latitude: 30 },
    ]);
    const page = await WorldMapPage();
    expect(page.props.children.props).toMatchObject({
      initialVillageId: 'own',
      initialLocation: { longitude: 31, latitude: 30 },
      initialOverview: false,
    });
  });
  it('refuses requested unauthorized worlds and villages instead of reading their coordinates', async () => {
    dependencies.list.mockResolvedValue([{ id: 'own-world', name: 'My world' }]);
    await expect(
      WorldMapPage({ searchParams: Promise.resolve({ worldId: 'private-world' }) }),
    ).rejects.toThrow('Not found');
    expect(dependencies.locations).not.toHaveBeenCalled();
    dependencies.locations.mockResolvedValue([
      { villageId: 'own', name: 'Mine', longitude: 31, latitude: 30 },
    ]);
    await expect(
      WorldMapPage({ searchParams: Promise.resolve({ worldId: 'own-world', villageId: 'enemy' }) }),
    ).rejects.toThrow('Not found');
  });
  it('shows an explicitly labeled reference atlas when the account has no geographic campaign', async () => {
    dependencies.list.mockResolvedValue([]);
    const page = await WorldMapPage();
    expect(page.props.children.props).toMatchObject({
      worlds: [PUBLIC_ATLAS_WORLD],
      initialWorldId: PUBLIC_ATLAS_WORLD.id,
      viewerPlayerId: PUBLIC_ATLAS_VIEWER_ID,
      referenceOnly: true,
      initialOverview: true,
    });
    expect(dependencies.list).toHaveBeenCalledWith({ id: 'alice', tokenVersion: 3 });
  });
  it('preserves authorized game campaign mode and excludes the reserved reference namespace', async () => {
    dependencies.list.mockResolvedValue([
      PUBLIC_ATLAS_WORLD,
      { id: 'private-campaign', name: 'My campaign' },
    ]);
    const page = await WorldMapPage();
    expect(page.props.children.props).toMatchObject({
      worlds: [{ id: 'private-campaign', name: 'My campaign' }],
      initialWorldId: 'private-campaign',
      referenceOnly: false,
    });
  });
  it('shows anonymous public landmarks without reading any private campaign', async () => {
    dependencies.session.mockResolvedValue(null);
    const page = await WorldMapPage();
    expect(page.props.children.props).toMatchObject({
      referenceOnly: true,
      viewerPlayerId: PUBLIC_ATLAS_VIEWER_ID,
    });
    expect(page.props.showBackButton).toBe(false);
    expect(page.props.children.props.pageActions.props.children[1].props.href).toBe(
      '/auth/sign-in?next=%2Fgames%2Fkingdoms%2Fworld-map',
    );
    expect(dependencies.identity).not.toHaveBeenCalled();
    expect(dependencies.list).not.toHaveBeenCalled();
  });
  it('keeps revoked logins restricted to the public atlas and surfaces genuine infrastructure failures', async () => {
    dependencies.identity.mockRejectedValue(new KingdomsHttpError(401, 'Revoked session'));
    const page = await WorldMapPage();
    expect(page.props.children.props).toMatchObject({
      referenceOnly: true,
      viewerPlayerId: PUBLIC_ATLAS_VIEWER_ID,
    });
    expect(dependencies.list).not.toHaveBeenCalled();
    dependencies.identity.mockResolvedValue({ id: 'alice', role: 'USER', tokenVersion: 3 });
    dependencies.list.mockRejectedValue(new Error('Database unavailable'));
    await expect(WorldMapPage()).rejects.toThrow('Database unavailable');
  });
});

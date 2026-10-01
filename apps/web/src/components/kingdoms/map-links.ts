export function geographicMapHref(worldId?: string, villageId?: string): string {
  const query = new URLSearchParams();
  if (worldId) query.set('worldId', worldId);
  if (villageId) query.set('villageId', villageId);
  return `/games/kingdoms/world-map/${query.size ? `?${query}` : ''}`;
}

export function villageManagementHref(worldId: string, villageId: string): string {
  const query = new URLSearchParams({ worldId, villageId, tab: 'village' });
  return `/games/kingdoms/?${query}`;
}

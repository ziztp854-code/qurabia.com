import 'server-only';
import {
  unionAreas,
  type Army,
  type City,
  type MapReadSnapshot,
  type SultanateTerritory,
} from '@mamluk/world-map-core/server';
import { projectWorld } from '../kingdoms/engine';
import type { KingdomsWorld } from '../kingdoms/types';
import type { MamlukMapState } from './storage';

/** Live ownership and private forces over the existing persisted, relocatable atlas. */
export class KingdomMapProjection {
  readonly armies: readonly Army[];
  readonly borders: readonly SultanateTerritory[];
  private readonly view: ReturnType<typeof projectWorld>;
  constructor(
    state: KingdomsWorld & { geography?: MamlukMapState },
    worldId: string,
    private readonly viewerId: string,
    serverTime: number,
  ) {
    this.view = projectWorld(state, viewerId, serverTime);
    const cities = new Map(state.geography?.cities.map(({ value }) => [value.id, value]) ?? []);
    const point = (id: string) => {
      const city = cities.get(id);
      return city ? { longitude: city.longitude, latitude: city.latitude } : null;
    };
    const ownerSultanateId = this.view.player?.allianceId ?? null;
    const stationed: Army[] = this.view.villages.flatMap((village) => {
      const location = point(village.id);
      if (!location || !Object.values(village.troops).some((count) => count > 0)) return [];
      const id = `garrison:${village.id}`;
      return [
        {
          id,
          worldId,
          ownerPlayerId: viewerId,
          ownerSultanateId,
          route: null,
          position: {
            armyId: id,
            ...location,
            status: 'stationed',
            origin: null,
            destination: null,
            departureTime: null,
            arrivalTime: null,
          },
        },
      ];
    });
    const moving: Army[] = this.view.movements.flatMap((movement) => {
      // Legacy return origins and empty-grid targets have no authoritative atlas anchor.
      if (movement.mission === 'return') return [];
      const source = this.view.map.find((v) => v.id === movement.sourceId);
      const target = this.view.map.find(
        (v) => v.x === movement.targetX && v.y === movement.targetY,
      );
      const origin = source && point(source.id),
        destination = target && point(target.id);
      if (!source || !origin || !destination) return [];
      const departureTime = movement.departedAt,
        arrivalTime = movement.arrivesAt;
      const progress = Math.max(
        0,
        Math.min(1, (serverTime - departureTime) / (arrivalTime - departureTime)),
      );
      // Interpolate across the short antimeridian arc; ETA remains engine-owned.
      const delta = ((destination.longitude - origin.longitude + 540) % 360) - 180;
      const longitude = ((origin.longitude + delta * progress + 540) % 360) - 180;
      return [
        {
          id: movement.id,
          worldId,
          ownerPlayerId: viewerId,
          ownerSultanateId,
          route: {
            origin,
            destination,
            waypoints: [],
            distanceUnit: 'tiles',
            distance: Math.hypot(movement.targetX - source.x, movement.targetY - source.y),
            departureTime,
            arrivalTime,
          },
          position: {
            armyId: movement.id,
            status: 'moving',
            origin,
            destination,
            departureTime,
            arrivalTime,
            longitude,
            latitude: origin.latitude + (destination.latitude - origin.latitude) * progress,
          },
        },
      ];
    });
    this.armies = [...stationed, ...moving].sort((a, b) => a.id.localeCompare(b.id));
    const ownIds = new Set(this.view.villages.map((v) => v.id));
    const ownPlots = state.geography?.territories.filter(({ value }) => ownIds.has(value.id)) ?? [];
    const geometry = ownerSultanateId
      ? unionAreas(ownPlots.map(({ value }) => value.geometry))
      : null;
    // Only the viewer's plots are granted here. Public settlement access never grants allied intelligence.
    this.borders =
      geometry && ownerSultanateId
        ? [
            {
              id: `own-alliance:${ownerSultanateId}`,
              worldId,
              sultanateId: ownerSultanateId,
              geometry,
            },
          ]
        : [];
  }
  city(city: City): City | null {
    const village = this.view.map.find((v) => v.id === city.id);
    if (!village) return null;
    const own = this.view.villages.find((v) => v.id === city.id);
    const alliance = this.view.alliances.find((a) => Object.hasOwn(a.members, village.ownerId));
    return {
      ...city,
      name: village.name,
      ownerPlayerId: village.ownerId,
      ownerSultanateId: alliance?.id ?? null,
      fortificationLevel: village.ownerId === this.viewerId ? (own?.buildings.wall ?? 0) : 0,
    };
  }
}

export function projectKingdomMap(
  state: KingdomsWorld & { geography?: MamlukMapState },
  snapshot: MapReadSnapshot,
) {
  return new KingdomMapProjection(
    state,
    snapshot.worldId,
    snapshot.viewerPlayerId,
    snapshot.serverTime,
  );
}

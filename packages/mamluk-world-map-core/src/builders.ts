import type { Coordinates } from './models';
import type { Feature, FeatureCollection, Geometry, JsonValue } from './geojson';
import type { MapLayers } from './presentation';
import { fogGeometry, lineGeometry } from './spatial';
import { assertVisibleWorld, type VisibleWorld } from './visibility';

type Properties = Readonly<Record<string, JsonValue>>;
function feature(id: string, geometry: Geometry, properties: Properties): Feature {
  return { type: 'Feature', id, geometry, properties };
}
function point(coordinates: Coordinates): Geometry {
  return { type: 'Point', coordinates: [coordinates.longitude, coordinates.latitude] };
}
function collection(features: readonly Feature[]): FeatureCollection {
  return { type: 'FeatureCollection', features };
}

export class CityGeoJsonBuilder {
  build(world: VisibleWorld): FeatureCollection {
    assertVisibleWorld(world);
    return collection([
      ...world.cities.map((city) =>
        feature(city.id, point(city), {
          kind: 'city',
          name: city.name,
          regionId: city.regionId,
          ownerPlayerId: city.ownerPlayerId,
          ownerSultanateId: city.ownerSultanateId,
          fortificationLevel: city.fortificationLevel,
          strategicValue: city.strategicValue,
        }),
      ),
    ]);
  }
  buildCastles(world: VisibleWorld): FeatureCollection {
    assertVisibleWorld(world);
    return collection(
      world.castles.map((castle) =>
        feature(castle.id, point(castle), {
          kind: 'castle',
          name: castle.name,
          cityId: castle.cityId,
          regionId: castle.regionId,
          ownerPlayerId: castle.ownerPlayerId,
          ownerSultanateId: castle.ownerSultanateId,
          fortificationLevel: castle.fortificationLevel,
          strategicValue: castle.strategicValue,
        }),
      ),
    );
  }
}

export class TerritoryGeoJsonBuilder {
  build(world: VisibleWorld): FeatureCollection {
    assertVisibleWorld(world);
    return collection(
      world.territories.map((territory) =>
        feature(territory.id, territory.geometry, {
          regionId: territory.regionId,
          ownerPlayerId: territory.ownerPlayerId,
          ownerSultanateId: territory.ownerSultanateId,
        }),
      ),
    );
  }
  buildSultanateBorders(world: VisibleWorld): FeatureCollection {
    assertVisibleWorld(world);
    return collection(
      world.sultanateTerritories.map((territory) =>
        feature(territory.id, territory.geometry, {
          sultanateId: territory.sultanateId,
        }),
      ),
    );
  }
}

export class ArmyGeoJsonBuilder {
  build(world: VisibleWorld): FeatureCollection {
    assertVisibleWorld(world);
    return collection(
      world.armies.map((army) =>
        feature(army.id, point(army), {
          armyId: army.id,
          ownerPlayerId: army.ownerPlayerId,
          ownerSultanateId: army.ownerSultanateId,
          status: army.status,
          own: army.own,
        }),
      ),
    );
  }
}

export class ArmyRouteGeoJsonBuilder {
  build(world: VisibleWorld): FeatureCollection {
    assertVisibleWorld(world);
    return collection(
      world.routes.map(({ armyId, route }) =>
        feature(armyId, lineGeometry([route.origin, ...route.waypoints, route.destination]), {
          armyId,
          distance: route.distance,
          departureTime: route.departureTime,
          arrivalTime: route.arrivalTime,
        }),
      ),
    );
  }
}

export class SiegeGeoJsonBuilder {
  build(world: VisibleWorld): FeatureCollection {
    assertVisibleWorld(world);
    return collection(
      world.sieges.map((siege) =>
        feature(siege.id, point(siege), {
          targetId: siege.targetId,
          targetKind: siege.targetKind,
          status: siege.status,
        }),
      ),
    );
  }
}

export class VisibilityGeoJsonBuilder {
  build(world: VisibleWorld): FeatureCollection {
    assertVisibleWorld(world);
    // Anonymous viewport-local IDs deliberately omit tower/scout identities and grant owners.
    return collection(
      world.visibility.map((area, index) =>
        feature(`vision-${index}`, area.geometry, { kind: area.kind }),
      ),
    );
  }
  buildFog(world: VisibleWorld): FeatureCollection {
    assertVisibleWorld(world);
    const geometry = fogGeometry(
      world.bounds,
      world.visibility.map((area) => area.geometry),
    );
    return collection(geometry === null ? [] : [feature('fog', geometry, { kind: 'fog' })]);
  }
}

export class GeoJsonProjection {
  build(world: VisibleWorld): MapLayers {
    const cities = new CityGeoJsonBuilder();
    const territories = new TerritoryGeoJsonBuilder();
    const visibility = new VisibilityGeoJsonBuilder();
    return {
      cities: cities.build(world),
      castles: cities.buildCastles(world),
      territories: territories.build(world),
      sultanateBorders: territories.buildSultanateBorders(world),
      armies: new ArmyGeoJsonBuilder().build(world),
      armyRoutes: new ArmyRouteGeoJsonBuilder().build(world),
      sieges: new SiegeGeoJsonBuilder().build(world),
      visibility: visibility.build(world),
      fog: visibility.buildFog(world),
    };
  }
}

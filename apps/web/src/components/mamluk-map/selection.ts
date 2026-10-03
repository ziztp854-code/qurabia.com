import type { Feature, MapPayload } from '@mamluk/world-map-core';

export type SelectableLayer = 'cities' | 'castles' | 'armies' | 'sieges';
export interface SelectionKey {
  readonly layer: SelectableLayer;
  readonly id: string;
}
export interface SelectionDetails extends SelectionKey {
  readonly title: string;
  readonly kind: string;
  readonly coordinates: string;
  readonly details: readonly { readonly label: string; readonly value: string }[];
}
const names = { cities: 'مدينة', castles: 'قلعة', armies: 'جيش', sieges: 'حصار' };
const statuses: Readonly<Record<string, string>> = {
  stationed: 'متمركز',
  moving: 'يتحرك',
  besieging: 'يحاصر',
  retreating: 'ينسحب',
  preparing: 'قيد الاستعداد',
  active: 'قائم',
  resolved: 'انتهى',
};
const number = (value: number) => new Intl.NumberFormat('ar-SA').format(value);
const field = (label: string, value: string) => ({ label, value });

function title(feature: Feature, layer: SelectableLayer): string {
  if (layer === 'armies') return feature.properties.own === true ? 'جيشك' : 'جيش مرصود';
  if (layer === 'sieges')
    return feature.properties.targetKind === 'castle' ? 'حصار قلعة' : 'حصار مدينة';
  return typeof feature.properties.name === 'string' ? feature.properties.name : names[layer];
}

/** Presentation allowlist. Neither click metadata nor arbitrary properties enter the panel. */
export function findSelection(
  payload: MapPayload | null,
  key: SelectionKey | null,
  viewerPlayerId: string,
  referenceOnly = false,
): SelectionDetails | null {
  if (!payload || !key) return null;
  if (referenceOnly && key.layer !== 'cities') return null;
  const feature = payload.layers[key.layer].features.find((entry) => entry.id === key.id);
  if (!feature || feature.geometry.type !== 'Point') return null;
  const [longitude, latitude] = feature.geometry.coordinates;
  const properties = feature.properties;
  if (referenceOnly) {
    return {
      ...key,
      title: title(feature, key.layer),
      kind: 'مرجع جغرافي',
      coordinates: `${longitude.toFixed(4)} / ${latitude.toFixed(4)}`,
      details: [],
    };
  }
  const details =
    key.layer === 'cities' || key.layer === 'castles'
      ? [
          field(
            'الملكية',
            properties.ownerPlayerId === viewerPlayerId
              ? 'تحت رايتك'
              : properties.ownerPlayerId === null
                ? 'مستقلة'
                : 'تحت راية أخرى',
          ),
          field('التحصين', number(Number(properties.fortificationLevel))),
          field('القيمة الاستراتيجية', number(Number(properties.strategicValue))),
        ]
      : [field('الحالة', statuses[String(properties.status)] ?? 'غير محددة')];
  const route =
    key.layer === 'armies' && properties.own === true && properties.ownerPlayerId === viewerPlayerId
      ? payload.layers.armyRoutes.features.find((entry) => entry.id === key.id)
      : undefined;
  const routeDetails = route
    ? [
        field(
          'المسافة',
          route.properties.distanceUnit === 'tiles'
            ? `${number(Number(route.properties.distance))} خانة`
            : `${number(Number(route.properties.distance) / 1000)} كم`,
        ),
        field(
          'الوصول',
          new Intl.DateTimeFormat('ar-SA', {
            timeZone: 'Asia/Riyadh',
            hour: '2-digit',
            minute: '2-digit',
          }).format(Number(route.properties.arrivalTime)),
        ),
      ]
    : [];
  return {
    ...key,
    title: title(feature, key.layer),
    kind: names[key.layer],
    coordinates: `${longitude.toFixed(4)} / ${latitude.toFixed(4)}`,
    details: [...details, ...routeDetails],
  };
}

export function listSelectableFeatures(
  payload: MapPayload | null,
  referenceOnly = false,
): readonly (SelectionKey & { readonly label: string })[] {
  if (!payload) return [];
  const layers: readonly SelectableLayer[] = referenceOnly
    ? ['cities']
    : ['cities', 'castles', 'armies', 'sieges'];
  return layers.flatMap((layer) =>
    payload.layers[layer].features.map((feature) => ({
      layer,
      id: feature.id,
      label: title(feature, layer),
    })),
  );
}

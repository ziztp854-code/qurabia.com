import { registerMapMarkerImages } from '@mamluk/maplibre-adapter';
import type { ExpressionSpecification, LayerSpecification, Map as LibreMap } from 'maplibre-gl';
import type { FeatureCollection } from '@mamluk/world-map-core';
import {
  MAX_OWN_MINIATURES,
  MINIATURE_RATIO,
  PUBLIC_MINIATURES,
  miniatureTier,
  ownedMiniature,
  rasterizeMiniature,
  villageMiniatureSvg,
  type MiniaturePalette,
} from './settlement-miniatures';

export type SettlementMap = Pick<
  LibreMap,
  'loadImage' | 'addImage' | 'hasImage' | 'on' | 'off' | 'isStyleLoaded'
> &
  Partial<Pick<LibreMap, 'getLayer' | 'setLayoutProperty' | 'removeImage'>>;
export interface SettlementColors {
  readonly label: string;
  readonly halo: string;
  readonly miniature?: MiniaturePalette;
}
export interface SettlementPresentation {
  readonly ready: Promise<boolean>;
  readonly layer: (layer: LayerSpecification) => LayerSpecification;
  readonly dispose: () => void;
  readonly prepareCities?: (data: FeatureCollection, viewerId?: string) => FeatureCollection;
  readonly clearPrivate?: () => void;
}
const publicMiniatureId: ExpressionSpecification = [
  'concat',
  'mamluk-village-mini-',
  [
    'to-string',
    ['step', ['coalesce', ['get', 'villageLevel'], 1], 1, 6, 2, 11, 3, 21, 4, 31, 5, 41, 6],
  ],
];
const miniatureIcon: ExpressionSpecification = [
  'coalesce',
  ['image', ['coalesce', ['get', 'villageThumbnail'], publicMiniatureId]],
  ['image', publicMiniatureId],
];
const tierIcon: ExpressionSpecification = [
  'case',
  ['>=', ['coalesce', ['get', 'villageLevel'], 0], 50],
  'mamluk-capital',
  ['concat', 'mamluk-tier-', ['to-string', ['coalesce', ['get', 'villageVisualTier'], 1]]],
];
const images = ['mamluk-village-art', 'mamluk-castle-art'] as const;
type Artwork = Awaited<ReturnType<SettlementMap['loadImage']>>;

class SettlementArtwork implements SettlementPresentation {
  readonly ready: Promise<boolean>;
  private finish: (success: boolean) => void = () => {};
  private active: boolean;
  private styleReady: boolean;
  private usable = false;
  private hdReady = false;
  private artwork: readonly Artwork[] = [];
  private miniReady = false;
  private miniatureAssets: { id: string; data: ImageData }[] = [];
  private readonly ownAssets = new Map<string, { data?: ImageData }>();

  constructor(
    private readonly map: SettlementMap,
    private readonly colors: SettlementColors,
    private readonly signal: AbortSignal,
    private readonly changed: () => void = () => {},
  ) {
    this.active = !signal.aborted;
    this.styleReady = Boolean(map.isStyleLoaded());
    this.ready = new Promise((resolve) => {
      this.finish = resolve;
    });
    if (!this.active) {
      this.finish(false);
      return;
    }
    map.on('style.load', this.onStyle);
    signal.addEventListener('abort', this.dispose, { once: true });
    void this.loadMiniatures();
    void this.load();
  }

  private get miniaturePalette(): MiniaturePalette {
    return (
      this.colors.miniature ?? {
        stone: this.colors.halo,
        sand: this.colors.halo,
        roof: this.colors.label,
        leaf: this.colors.label,
        water: this.colors.halo,
        ink: this.colors.label,
      }
    );
  }

  private async loadMiniatures() {
    try {
      const assets = await Promise.all(
        PUBLIC_MINIATURES.map(async (tier) => ({
          id: `mamluk-village-mini-${tier}`,
          data: await rasterizeMiniature(villageMiniatureSvg(tier, this.miniaturePalette)),
        })),
      );
      if (!this.active) return;
      this.miniatureAssets = assets;
      this.registerMiniatures();
    } catch {
      /* Data and the circle fallback remain usable without artwork. */
    }
  }

  private registerMiniatures() {
    if (!this.active || !this.styleReady || !this.miniatureAssets.length) return;
    try {
      for (const asset of this.miniatureAssets)
        if (!this.map.hasImage(asset.id))
          this.map.addImage(asset.id, asset.data, { pixelRatio: MINIATURE_RATIO });
      for (const [id, asset] of this.ownAssets)
        if (asset.data && !this.map.hasImage(id))
          this.map.addImage(id, asset.data, { pixelRatio: MINIATURE_RATIO });
      this.miniReady = true;
      this.finish(true);
      this.changed();
    } catch {
      this.miniReady = false;
    }
  }

  readonly clearPrivate = () => {
    for (const id of this.ownAssets.keys()) {
      try {
        if (this.map.hasImage(id)) this.map.removeImage?.(id);
      } catch {
        /* Style is being replaced. */
      }
    }
    this.ownAssets.clear();
  };

  readonly prepareCities = (data: FeatureCollection, viewerId?: string): FeatureCollection => {
    const desired = new Set<string>();
    const features = data.features.map((feature) => {
      const own = ownedMiniature(feature.properties, viewerId);
      if (!own) return feature;
      if (!this.ownAssets.has(own.id) && this.ownAssets.size >= MAX_OWN_MINIATURES) return feature;
      desired.add(own.id);
      if (!this.ownAssets.has(own.id)) {
        const asset: { data?: ImageData } = {};
        this.ownAssets.set(own.id, asset);
        void rasterizeMiniature(
          villageMiniatureSvg(
            miniatureTier(feature.properties.villageLevel),
            this.miniaturePalette,
            own.levels,
          ),
        )
          .then((image) => {
            if (!this.active || this.ownAssets.get(own.id) !== asset) return;
            asset.data = image;
            this.registerMiniatures();
          })
          .catch(() => {
            if (this.ownAssets.get(own.id) === asset) this.ownAssets.delete(own.id);
          });
      }
      return { ...feature, properties: { ...feature.properties, villageThumbnail: own.id } };
    });
    for (const id of this.ownAssets.keys()) {
      if (desired.has(id)) continue;
      try {
        if (this.map.hasImage(id)) this.map.removeImage?.(id);
      } catch {
        /* Source update is in progress. */
      }
      this.ownAssets.delete(id);
    }
    return { ...data, features };
  };

  private async load(): Promise<void> {
    try {
      // Static same-origin artwork contains no game information. Loading either
      // asset unsuccessfully leaves both original approved circle layers usable.
      const artwork = await Promise.all([
        this.map.loadImage('/game-art/mamluk-map/village.png'),
        this.map.loadImage('/game-art/mamluk-map/castle.png'),
      ]);
      if (!this.active) return;
      this.artwork = artwork;
      const registered = this.register();
      this.changed();
      if (this.styleReady) await this.registerHd();
      this.finish(registered);
    } catch {
      this.artwork = [];
      this.usable = false;
      this.finish(false);
    }
  }

  private register(): boolean {
    this.usable = false;
    if (!this.active || this.artwork.length !== images.length) return false;
    if (!this.styleReady) return true; // Cached assets await the SDK's style event.
    try {
      images.forEach((id, index) => {
        if (!this.map.hasImage(id))
          this.map.addImage(id, this.artwork[index].data, { pixelRatio: 4 });
      });
      this.usable = images.every((id) => this.map.hasImage(id));
      return this.usable;
    } catch {
      return false;
    }
  }

  private async registerHd(): Promise<void> {
    try {
      await registerMapMarkerImages({
        hasImage: (id) => !this.active || this.map.hasImage(id),
        addImage: (id, image, options) => {
          if (this.active) this.map.addImage(id, image, options);
          return this.map as LibreMap;
        },
      });
      if (this.active) {
        this.hdReady = true;
        for (const id of ['mamluk-castles']) {
          const current = this.map.getLayer?.(id);
          if (current?.type !== 'symbol') continue;
          this.map.setLayoutProperty?.(
            id,
            'icon-image',
            id === 'mamluk-castles' ? 'mamluk-castle' : tierIcon,
          );
          this.map.setLayoutProperty?.(id, 'icon-anchor', 'center');
          this.map.setLayoutProperty?.(id, 'icon-size', [
            'interpolate',
            ['linear'],
            ['zoom'],
            3,
            0.6,
            10,
            0.95,
            14,
            1.1,
          ]);
        }
      }
    } catch {
      // The same-origin settlement artwork remains usable if rasterization fails.
      this.hdReady = false;
    }
  }

  private readonly onStyle = () => {
    this.styleReady = true;
    this.hdReady = false;
    this.register();
    this.miniReady = false;
    this.registerMiniatures();
    void this.registerHd();
  };

  readonly dispose = () => {
    if (!this.active) return;
    this.active = false;
    this.usable = false;
    this.artwork = [];
    this.clearPrivate();
    this.miniatureAssets = [];
    this.map.off('style.load', this.onStyle);
    this.signal.removeEventListener('abort', this.dispose);
    this.finish(false); // Teardown never waits for SDK image requests.
  };

  readonly layer = (layer: LayerSpecification): LayerSpecification => {
    if (
      this.active &&
      this.miniReady &&
      layer.id === 'mamluk-cities' &&
      layer.type === 'circle' &&
      layer.source === layer.id
    ) {
      const miniature = settlementLayer(layer, 'mamluk-village-mini-1', this.colors);
      if (miniature.type === 'symbol')
        return {
          ...miniature,
          layout: {
            ...miniature.layout,
            'icon-image': miniatureIcon,
            'icon-anchor': 'center',
            'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.85, 8, 1.3, 14, 1.8],
            'text-offset': [0, 2],
            'text-field': [
              'case',
              ['>', ['coalesce', ['get', 'villageLevel'], 0], 0],
              ['concat', ['get', 'name'], ' · ', ['to-string', ['get', 'villageLevel']]],
              ['get', 'name'],
            ],
          },
        };
    }
    const image =
      layer.id === 'mamluk-cities' ? images[0] : layer.id === 'mamluk-castles' ? images[1] : null;
    if (
      !this.active ||
      !this.usable ||
      !image ||
      layer.type !== 'circle' ||
      layer.source !== layer.id ||
      !images.every((id) => this.map.hasImage(id))
    )
      return layer;
    const presented = settlementLayer(layer, image, this.colors);
    if (!this.hdReady || presented.type !== 'symbol') return presented;
    return {
      ...presented,
      layout: {
        ...presented.layout,
        'icon-image': layer.id === 'mamluk-castles' ? 'mamluk-castle' : tierIcon,
        'icon-anchor': 'center',
        'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.6, 10, 0.95, 14, 1.1],
      },
    };
  };
}

function settlementLayer(
  layer: Extract<LayerSpecification, { type: 'circle' }>,
  image: string,
  colors: SettlementColors,
): LayerSpecification {
  return {
    ...layer,
    type: 'symbol',
    layout: {
      visibility: layer.layout?.visibility ?? 'visible',
      'icon-image': image,
      'icon-anchor': 'bottom',
      'icon-pitch-alignment': 'viewport',
      'icon-rotation-alignment': 'viewport',
      'icon-size': [
        'interpolate',
        ['linear'],
        ['zoom'],
        3,
        ['+', 0.65, ['*', 0.05, ['coalesce', ['get', 'villageVisualTier'], 1]]],
        10,
        ['+', 0.95, ['*', 0.08, ['coalesce', ['get', 'villageVisualTier'], 1]]],
        14,
        ['+', 1.15, ['*', 0.1, ['coalesce', ['get', 'villageVisualTier'], 1]]],
      ],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'text-field': [
        'step',
        ['zoom'],
        [
          'case',
          ['>', ['coalesce', ['get', 'villageLevel'], 0], 0],
          ['to-string', ['get', 'villageLevel']],
          '',
        ],
        12,
        [
          'case',
          ['>', ['coalesce', ['get', 'villageLevel'], 0], 0],
          ['concat', ['get', 'name'], ' · المستوى ', ['to-string', ['get', 'villageLevel']]],
          ['get', 'name'],
        ],
      ],
      'text-font': ['Cairo'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 3, 11, 10, 14],
      'text-anchor': 'top',
      'text-pitch-alignment': 'viewport',
      'text-rotation-alignment': 'viewport',
      'text-offset': [0, 0.3],
      'text-optional': true,
      'text-padding': 3,
    },
    paint: {
      'text-color': colors.label,
      'text-halo-color': colors.halo,
      'text-halo-width': 1.5,
      'icon-opacity': 1,
    },
  };
}

export function createSettlementPresentation(
  map: SettlementMap,
  colors: SettlementColors,
  signal: AbortSignal,
  changed: () => void = () => {},
): SettlementPresentation {
  return new SettlementArtwork(map, colors, signal, changed);
}

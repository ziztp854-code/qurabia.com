import { registerMapMarkerImages } from '@mamluk/maplibre-adapter';
import type { ExpressionSpecification, LayerSpecification, Map as LibreMap } from 'maplibre-gl';

export type SettlementMap = Pick<
  LibreMap,
  'loadImage' | 'addImage' | 'hasImage' | 'on' | 'off' | 'isStyleLoaded'
> &
  Partial<Pick<LibreMap, 'getLayer' | 'setLayoutProperty'>>;
export interface SettlementColors {
  readonly label: string;
  readonly halo: string;
}
export interface SettlementPresentation {
  readonly ready: Promise<boolean>;
  readonly layer: (layer: LayerSpecification) => LayerSpecification;
  readonly dispose: () => void;
}
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

  constructor(
    private readonly map: SettlementMap,
    private readonly colors: SettlementColors,
    private readonly signal: AbortSignal,
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
    void this.load();
  }

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
        for (const id of ['mamluk-cities', 'mamluk-castles']) {
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
    void this.registerHd();
  };

  readonly dispose = () => {
    if (!this.active) return;
    this.active = false;
    this.usable = false;
    this.artwork = [];
    this.map.off('style.load', this.onStyle);
    this.signal.removeEventListener('abort', this.dispose);
    this.finish(false); // Teardown never waits for SDK image requests.
  };

  readonly layer = (layer: LayerSpecification): LayerSpecification => {
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
        ['get', 'name'],
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
): SettlementPresentation {
  return new SettlementArtwork(map, colors, signal);
}

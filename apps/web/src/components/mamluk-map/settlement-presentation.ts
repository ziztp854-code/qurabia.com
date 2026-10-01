import type { LayerSpecification, Map as LibreMap } from 'maplibre-gl';

export type SettlementMap = Pick<
  LibreMap,
  'loadImage' | 'addImage' | 'hasImage' | 'on' | 'off' | 'isStyleLoaded'
>;
export interface SettlementColors {
  readonly label: string;
  readonly halo: string;
}
export interface SettlementPresentation {
  readonly ready: Promise<boolean>;
  readonly layer: (layer: LayerSpecification) => LayerSpecification;
  readonly dispose: () => void;
}
const images = ['mamluk-village-art', 'mamluk-castle-art'] as const;
type Artwork = Awaited<ReturnType<SettlementMap['loadImage']>>;

class SettlementArtwork implements SettlementPresentation {
  readonly ready: Promise<boolean>;
  private finish: (success: boolean) => void = () => {};
  private active: boolean;
  private styleReady: boolean;
  private usable = false;
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
      this.finish(this.register());
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

  private readonly onStyle = () => {
    this.styleReady = true;
    this.register();
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
    return settlementLayer(layer, image, this.colors);
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
      'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.8, 6, 1, 10, 1.25, 14, 1.55],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Regular'],
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

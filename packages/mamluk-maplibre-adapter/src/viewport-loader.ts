import type { BoundingBox, MapPayload } from '@mamluk/world-map-core';
import type { MapLibreAdapter, MapLibrePort } from './adapter';

export interface ViewportLoaderOptions {
  /** Implement with authenticated, no-store transport and runtime payload decoding. */
  readonly load: (bounds: BoundingBox, signal: AbortSignal) => Promise<MapPayload>;
  readonly now?: () => number;
  readonly debounceMs?: number;
  readonly refreshMs?: number;
  readonly maxLongitudeSpan?: number;
  readonly maxLatitudeSpan?: number;
  readonly onError?: (error: unknown) => void;
}

/** Coordinates requests; cannot calculate game state or derive visibility. */
export class ViewportLoader {
  private request: AbortController | undefined;
  private generation = 0;
  private disposed = false;
  private debounce: ReturnType<typeof setTimeout> | undefined;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly now: () => number;
  private readonly onMove = () => this.queue();

  constructor(
    private readonly map: Pick<MapLibrePort, 'on' | 'off'>,
    private readonly adapter: MapLibreAdapter,
    private readonly options: ViewportLoaderOptions,
  ) {
    this.now = options.now ?? (() => performance.now());
    map.on('moveend', this.onMove);
  }

  async refresh(): Promise<void> {
    if (this.disposed) return;
    const generation = this.invalidate();
    const bounds = this.adapter.getViewportBounds();
    if (!this.canLoad(bounds)) return;
    const request = new AbortController();
    this.request = request;
    const started = this.now();
    try {
      const payload = await this.options.load(bounds, request.signal);
      if (this.disposed || request.signal.aborted || generation !== this.generation) return;
      if (!this.sameBounds(bounds, payload.bounds)) throw new Error('Payload viewport mismatch');
      this.adapter.render(payload, Math.max(0, this.now() - started));
      this.refreshTimer = setTimeout(() => void this.refresh(), this.options.refreshMs ?? 5000);
    } catch (error: unknown) {
      if (this.disposed || request.signal.aborted || generation !== this.generation) return;
      this.adapter.clear();
      this.options.onError?.(error);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.invalidate();
    this.map.off('moveend', this.onMove);
    this.disposed = true;
  }

  private queue(): void {
    this.invalidate();
    this.debounce = setTimeout(() => void this.refresh(), this.options.debounceMs ?? 150);
  }

  private invalidate(): number {
    this.generation += 1;
    this.request?.abort();
    clearTimeout(this.debounce);
    clearTimeout(this.refreshTimer);
    this.adapter.clear();
    return this.generation;
  }

  private canLoad(bounds: BoundingBox): boolean {
    const width =
      bounds.east > bounds.west ? bounds.east - bounds.west : 360 - bounds.west + bounds.east;
    return (
      width > 0 &&
      width <= (this.options.maxLongitudeSpan ?? 90) &&
      bounds.north > bounds.south &&
      bounds.north - bounds.south <= (this.options.maxLatitudeSpan ?? 90)
    );
  }

  private sameBounds(left: BoundingBox, right: BoundingBox): boolean {
    return (
      left.west === right.west &&
      left.east === right.east &&
      left.south === right.south &&
      left.north === right.north
    );
  }
}
